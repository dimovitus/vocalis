use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ComputeBackendId {
    Auto,
    Cpu,
    Cuda,
    Coreml,
    AppleSilicon,
    Dml,
    Rocm,
}

impl ComputeBackendId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Cpu => "cpu",
            Self::Cuda => "cuda",
            Self::Coreml => "coreml",
            Self::AppleSilicon => "appleSilicon",
            Self::Dml => "dml",
            Self::Rocm => "rocm",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "auto" => Some(Self::Auto),
            "cpu" => Some(Self::Cpu),
            "cuda" => Some(Self::Cuda),
            "coreml" => Some(Self::Coreml),
            "appleSilicon" => Some(Self::AppleSilicon),
            "dml" => Some(Self::Dml),
            "rocm" => Some(Self::Rocm),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemHardwareInfo {
    pub os: String,
    pub arch: String,
    pub cpu_model: String,
    pub cpu_cores: u32,
    pub ram_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuDeviceInfo {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub vram_bytes: Option<u64>,
    pub backend: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MlHardwareProbe {
    pub cpu_model: String,
    pub cpu_cores: u32,
    pub ram_bytes: Option<u64>,
    pub platform: String,
    pub machine: String,
    pub gpu_devices: Vec<GpuDeviceInfo>,
    pub cuda_available: bool,
    pub onnx_providers: Vec<String>,
    pub available_backends: Vec<String>,
    pub recommended_backend: String,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareCapabilities {
    pub system: SystemHardwareInfo,
    pub ml: Option<MlHardwareProbe>,
    pub available_backends: Vec<String>,
    pub recommended_backend: String,
    pub python_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedComputeSettings {
    pub requested_backend: String,
    pub effective_backend: String,
    pub whisper_device: String,
    pub whisper_compute_type: String,
    pub separation_providers: String,
    pub fallback: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveComputeBackendRequest {
    pub backend: String,
}
