use std::path::PathBuf;
use std::time::Duration;
use vocalis_lib::services::{PythonPingResult, PythonWorker};

fn worker_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("apps")
        .join("ai-worker")
        .join("worker.py")
}

#[test]
#[ignore = "requires python3 worker script"]
fn pipeline_smoke() {
    let script = worker_script_path();
    assert!(
        script.exists(),
        "worker script missing at {}",
        script.display()
    );

    let worker = PythonWorker::new(script, 10_000);
    worker.ensure_running().expect("worker should start");

    let result: PythonPingResult = worker.ping().expect("ping should succeed");
    assert_eq!(result.message, "Vocalis AI worker ready");
    assert!(!result.worker_id.is_empty());
    assert!(!result.python_version.is_empty());

    std::thread::sleep(Duration::from_millis(50));
}
