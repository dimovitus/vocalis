//! Phase 17 — hardware capability layer (CPU / RAM / GPU / ML backends).

mod types;

pub use types::{
    ComputeBackendId, GpuDeviceInfo, HardwareCapabilities, MlHardwareProbe,
    ResolveComputeBackendRequest, ResolvedComputeSettings, SystemHardwareInfo,
};

use crate::error::AppError;
use crate::services::{detect_environment, PythonWorker};
use std::time::Duration;

pub fn detect_system_hardware() -> SystemHardwareInfo {
    let env = detect_environment();
    SystemHardwareInfo {
        os: env.os,
        arch: env.arch,
        cpu_model: read_cpu_model(),
        cpu_cores: std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(1),
        ram_bytes: read_ram_bytes(),
    }
}

pub fn probe_ml_hardware(worker: &PythonWorker) -> Result<MlHardwareProbe, AppError> {
    worker.call_with_timeout("probe_hardware", None, Duration::from_secs(15))
}

pub fn get_hardware_capabilities(worker: &PythonWorker) -> HardwareCapabilities {
    let system = detect_system_hardware();
    let env = detect_environment();

    let ml = match probe_ml_hardware(worker) {
        Ok(probe) => Some(probe),
        Err(err) => {
            tracing::warn!("ML hardware probe failed: {err}");
            None
        }
    };

    let (available_backends, recommended_backend) = if let Some(ref probe) = ml {
        (
            probe.available_backends.clone(),
            probe.recommended_backend.clone(),
        )
    } else {
        (vec!["cpu".into()], "cpu".into())
    };

    HardwareCapabilities {
        python_available: env.python_available,
        system,
        ml,
        available_backends,
        recommended_backend,
    }
}

pub fn resolve_compute_backend(
    capabilities: &HardwareCapabilities,
    request: &ResolveComputeBackendRequest,
) -> ResolvedComputeSettings {
    let available: Vec<&str> = capabilities
        .available_backends
        .iter()
        .map(String::as_str)
        .collect();

    let requested = request.backend.trim();
    let requested_backend = if requested.is_empty() || requested == "auto" {
        "auto"
    } else {
        requested
    };

    let pick = |backend: &str| -> (String, bool, Option<String>) {
        if backend == "cpu" || available.contains(&backend) {
            return (backend.to_string(), false, None);
        }
        (
            "cpu".into(),
            true,
            Some(format!(
                "Backend '{backend}' unavailable — falling back to CPU."
            )),
        )
    };

    let (effective_backend, fallback, note) = if requested_backend == "auto" {
        let recommended = capabilities.recommended_backend.clone();
        if available.contains(&recommended.as_str()) {
            (recommended, false, None)
        } else {
            ("cpu".into(), false, None)
        }
    } else {
        pick(requested_backend)
    };

    let whisper = whisper_settings(&effective_backend);
    let separation = separation_providers(&effective_backend, capabilities);

    ResolvedComputeSettings {
        requested_backend: requested_backend.into(),
        effective_backend,
        whisper_device: whisper.0.into(),
        whisper_compute_type: whisper.1.into(),
        separation_providers: separation.into(),
        fallback,
        note,
    }
}

fn whisper_settings(backend: &str) -> (&'static str, &'static str) {
    match backend {
        "cuda" | "rocm" => ("cuda", "float16"),
        _ => ("cpu", "int8"),
    }
}

fn separation_providers(backend: &str, capabilities: &HardwareCapabilities) -> String {
    let onnx = capabilities
        .ml
        .as_ref()
        .map(|m| m.onnx_providers.as_slice())
        .unwrap_or(&[]);

    match backend {
        "cuda" if onnx.iter().any(|p| p == "CUDAExecutionProvider") => "cuda".into(),
        "coreml" if onnx.iter().any(|p| p == "CoreMLExecutionProvider") => "coreml".into(),
        "dml" if onnx.iter().any(|p| p == "DmlExecutionProvider") => "dml".into(),
        "appleSilicon" => {
            if onnx.iter().any(|p| p == "CoreMLExecutionProvider") {
                "coreml".into()
            } else {
                "cpu".into()
            }
        }
        "auto" => "auto".into(),
        _ => "cpu".into(),
    }
}

fn read_cpu_model() -> String {
    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in content.lines() {
                if let Some(model) = line.strip_prefix("model name\t:") {
                    return model.trim().into();
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }

    format!("{} {}", std::env::consts::ARCH, std::env::consts::OS)
}

fn read_ram_bytes() -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        let content = std::fs::read_to_string("/proc/meminfo").ok()?;
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("MemTotal:") {
                let kb = rest.split_whitespace().next()?.parse::<u64>().ok()?;
                return Some(kb * 1024);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                return text.trim().parse::<u64>().ok();
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_caps(backends: &[&str]) -> HardwareCapabilities {
        HardwareCapabilities {
            system: detect_system_hardware(),
            ml: None,
            available_backends: backends.iter().map(|s| (*s).into()).collect(),
            recommended_backend: backends.first().copied().unwrap_or("cpu").into(),
            python_available: true,
        }
    }

    #[test]
    fn falls_back_to_cpu_for_unknown_backend() {
        let caps = sample_caps(&["cpu"]);
        let resolved = resolve_compute_backend(
            &caps,
            &ResolveComputeBackendRequest {
                backend: "cuda".into(),
            },
        );
        assert_eq!(resolved.effective_backend, "cpu");
        assert!(resolved.fallback);
        assert_eq!(resolved.whisper_device, "cpu");
    }

    #[test]
    fn auto_picks_recommended_backend() {
        let mut caps = sample_caps(&["cpu", "cuda"]);
        caps.recommended_backend = "cuda".into();
        let resolved = resolve_compute_backend(
            &caps,
            &ResolveComputeBackendRequest {
                backend: "auto".into(),
            },
        );
        assert_eq!(resolved.effective_backend, "cuda");
        assert_eq!(resolved.whisper_device, "cuda");
    }
}
