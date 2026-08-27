use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerRequest {
    pub id: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerResponse {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<WorkerError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonPingResult {
    pub worker_id: String,
    pub version: String,
    pub message: String,
    pub python_version: String,
    #[serde(default)]
    pub engines: Vec<String>,
    #[serde(default)]
    pub alignment_engines: Vec<String>,
    #[serde(default)]
    pub separation_engines: Vec<String>,
    #[serde(default)]
    pub correction_engines: Vec<String>,
    #[serde(default)]
    pub structure_engines: Vec<String>,
}

pub struct PythonWorker {
    child: Mutex<Option<Child>>,
    script_path: PathBuf,
    python_bin: PathBuf,
    timeout: Duration,
}

impl PythonWorker {
    pub fn new(script_path: PathBuf, timeout_ms: u64) -> Self {
        let python_bin = resolve_python_bin(&script_path);
        Self {
            child: Mutex::new(None),
            script_path,
            python_bin,
            timeout: Duration::from_millis(timeout_ms),
        }
    }

    pub fn script_path(&self) -> &Path {
        &self.script_path
    }

    pub fn ensure_running(&self) -> Result<(), AppError> {
        let mut guard = self
            .child
            .lock()
            .map_err(|_| AppError::Internal("Python worker lock poisoned".into()))?;

        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    tracing::warn!("Python worker exited, restarting");
                    *guard = None;
                }
                Ok(None) => return Ok(()),
                Err(err) => {
                    return Err(AppError::PythonWorker(format!(
                        "Failed to check worker status: {err}"
                    )));
                }
            }
        }

        if !self.script_path.exists() {
            return Err(AppError::PythonWorker(format!(
                "Worker script not found: {}",
                self.script_path.display()
            )));
        }

        tracing::info!(
            "Starting Python worker with {} {}",
            self.python_bin.display(),
            self.script_path.display()
        );

        let mut child = Command::new(&self.python_bin)
            .arg(&self.script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| {
                AppError::PythonWorker(format!(
                    "Failed to start Python worker ({}): {err}",
                    self.python_bin.display()
                ))
            })?;

        if let Some(stderr) = child.stderr.take() {
            thread::spawn(move || drain_worker_stderr(stderr));
        }

        tracing::info!("Python worker started (pid={})", child.id());

        *guard = Some(child);
        Ok(())
    }

    pub fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<T, AppError> {
        match self.call_with_timeout(method, params.clone(), self.timeout) {
            Ok(value) => Ok(value),
            Err(err) if is_worker_transport_error(&err) => {
                tracing::warn!(
                    "Worker transport failure for '{method}' — restarting and retrying once: {err}"
                );
                self.restart_worker()?;
                self.call_with_timeout(method, params, self.timeout)
            }
            Err(err) => Err(err),
        }
    }

    pub fn call_with_timeout<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
        timeout: Duration,
    ) -> Result<T, AppError> {
        self.ensure_running()?;

        let request = WorkerRequest {
            id: Uuid::new_v4().to_string(),
            method: method.into(),
            params,
        };

        let request_line = serde_json::to_string(&request)
            .map_err(|err| AppError::Ipc(format!("Failed to serialize request: {err}")))?;

        let mut guard = self
            .child
            .lock()
            .map_err(|_| AppError::Internal("Python worker lock poisoned".into()))?;

        let child = guard
            .as_mut()
            .ok_or_else(|| AppError::PythonWorker("Worker not running".into()))?;

        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| AppError::Ipc("Worker stdin unavailable".into()))?;
        let stdout = child
            .stdout
            .as_mut()
            .ok_or_else(|| AppError::Ipc("Worker stdout unavailable".into()))?;

        stdin
            .write_all(format!("{request_line}\n").as_bytes())
            .map_err(|err| AppError::Ipc(format!("Failed to write to worker: {err}")))?;
        stdin
            .flush()
            .map_err(|err| AppError::Ipc(format!("Failed to flush worker stdin: {err}")))?;

        let mut reader = BufReader::new(stdout);
        let started = Instant::now();
        let mut response_line = String::new();

        while started.elapsed() < timeout {
            response_line.clear();
            match reader.read_line(&mut response_line) {
                Ok(0) => {
                    return Err(AppError::PythonWorker(
                        "Worker closed stdout unexpectedly".into(),
                    ));
                }
                Ok(_) => {
                    let trimmed = response_line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let response: WorkerResponse = serde_json::from_str(trimmed).map_err(|err| {
                        AppError::Ipc(format!("Invalid worker response: {err}; raw={trimmed}"))
                    })?;

                    if response.id != request.id {
                        tracing::warn!(
                            "Skipping mismatched worker response id={} expected={}",
                            response.id,
                            request.id
                        );
                        continue;
                    }

                    if let Some(error) = response.error {
                        return Err(AppError::PythonWorker(format!(
                            "{}: {}",
                            error.code, error.message
                        )));
                    }

                    let result = response
                        .result
                        .ok_or_else(|| AppError::Ipc("Worker response missing result".into()))?;

                    return serde_json::from_value(result).map_err(|err| {
                        AppError::Ipc(format!("Failed to deserialize worker result: {err}"))
                    });
                }
                Err(err) => {
                    return Err(AppError::Ipc(format!("Failed to read worker output: {err}")));
                }
            }
        }

        drop(guard);
        self.restart_worker()?;

        Err(AppError::PythonWorker(format!(
            "Worker timed out after {}ms for method '{method}'",
            timeout.as_millis()
        )))
    }

    fn restart_worker(&self) -> Result<(), AppError> {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
                tracing::warn!("Python worker restarted after failure/timeout");
            }
        }
        self.ensure_running()
    }

    pub fn ping(&self) -> Result<PythonPingResult, AppError> {
        self.call("ping", None)
    }

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
                tracing::info!("Python worker stopped");
            }
        }
    }
}

fn is_worker_transport_error(err: &AppError) -> bool {
    match err {
        AppError::Ipc(msg) => {
            let lower = msg.to_lowercase();
            lower.contains("failed to read worker")
                || lower.contains("failed to write to worker")
                || lower.contains("worker stdin unavailable")
                || lower.contains("worker stdout unavailable")
        }
        AppError::PythonWorker(msg) => {
            let lower = msg.to_lowercase();
            (lower.contains("closed stdout") || lower.contains("worker not running"))
                && !lower.contains("timed out")
        }
        _ => false,
    }
}

impl Drop for PythonWorker {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn drain_worker_stderr(stderr: impl std::io::Read + Send + 'static) {
    let reader = BufReader::new(stderr);
    for line in reader.lines() {
        match line {
            Ok(text) if !text.trim().is_empty() => {
                tracing::debug!(target: "python_worker", "{text}");
            }
            _ => break,
        }
    }
}

/// Prefer the worker venv interpreter so ML deps resolve correctly.
fn resolve_python_bin(script_path: &Path) -> PathBuf {
    if let Some(dir) = script_path.parent() {
        let candidates = [
            dir.join(".venv/bin/python"),
            dir.join(".venv/bin/python3"),
            dir.join("venv/bin/python"),
        ];
        for candidate in candidates {
            if candidate.exists() {
                return candidate;
            }
        }
    }
    PathBuf::from("python3")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worker_request_serializes_with_camel_case() {
        let request = WorkerRequest {
            id: "test-id".into(),
            method: "ping".into(),
            params: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"id\":\"test-id\""));
        assert!(json.contains("\"method\":\"ping\""));
    }
}
