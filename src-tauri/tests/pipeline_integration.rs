use std::path::PathBuf;
use std::time::Duration;
use vocalis_lib::services::PythonWorker;

fn worker_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("apps")
        .join("ai-worker")
        .join("worker.py")
}

#[test]
#[ignore = "requires python3 worker script"]
fn worker_probe_hardware_and_list_models() {
    let script = worker_script_path();
    assert!(script.exists(), "worker script missing at {}", script.display());

    let worker = PythonWorker::new(script, 15_000);
    worker.ensure_running().expect("worker should start");

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct HardwareProbe {
        available_backends: Vec<String>,
        onnx_providers: Vec<String>,
    }

    let hardware: HardwareProbe = worker
        .call("probe_hardware", None)
        .expect("probe_hardware should succeed");
    assert!(hardware.available_backends.contains(&"cpu".into()));
    assert!(!hardware.onnx_providers.is_empty());

    let temp = std::env::temp_dir().join(format!(
        "vocalis-models-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&temp).unwrap();

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ModelInventory {
        items: Vec<serde_json::Value>,
    }

    let inventory: ModelInventory = worker
        .call(
            "list_models",
            Some(serde_json::json!({ "dataDir": temp.to_string_lossy() })),
        )
        .expect("list_models should succeed");
    assert!(!inventory.items.is_empty());

    let err = worker
        .call_with_timeout::<serde_json::Value>(
            "definitely_not_a_method",
            None,
            Duration::from_secs(5),
        )
        .unwrap_err();
    let response = err.to_response();
    assert_eq!(response.code, "PYTHON_WORKER_ERROR");

    let _ = std::fs::remove_dir_all(temp);
    std::thread::sleep(Duration::from_millis(50));
}
