use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInfo {
    pub os: String,
    pub arch: String,
    pub python_available: bool,
    pub python_version: Option<String>,
    pub ffmpeg_available: bool,
    pub ffmpeg_version: Option<String>,
}

pub fn detect_environment() -> EnvironmentInfo {
    let python = detect_command_version("python3", &["--version"]);
    let ffmpeg = detect_command_version("ffmpeg", &["-version"]);

    EnvironmentInfo {
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        python_available: python.is_some(),
        python_version: python,
        ffmpeg_available: ffmpeg.is_some(),
        ffmpeg_version: ffmpeg.map(|v| v.lines().next().unwrap_or(&v).to_string()),
    }
}

fn detect_command_version(command: &str, args: &[&str]) -> Option<String> {
    Command::new(command)
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stdout.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            }
        })
        .filter(|s| !s.is_empty())
}
