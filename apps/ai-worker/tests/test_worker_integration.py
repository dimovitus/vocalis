"""Integration tests for worker RPC surface (no ML downloads)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1] / "worker.py"


def send_request(method: str, params: dict | None = None, timeout: float = 10) -> dict:
    request = {"id": "integration-1", "method": method}
    if params is not None:
        request["params"] = params

    process = subprocess.Popen(
        [sys.executable, str(WORKER)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    stdout, _stderr = process.communicate(
        input=json.dumps(request) + "\n",
        timeout=timeout,
    )
    return json.loads(stdout.strip())


def test_ping_lists_transcription_engines() -> None:
    response = send_request("ping")
    assert "result" in response
    engines = response["result"]["engines"]
    assert isinstance(engines, list)
    assert "faster-whisper" in engines


def test_list_models_inventory_shape(tmp_path: Path) -> None:
    response = send_request("list_models", {"dataDir": str(tmp_path)})
    assert "result" in response
    items = response["result"]["items"]
    assert isinstance(items, list)
    assert any(item["stage"] == "transcription" for item in items)


def test_worker_error_payload_is_structured() -> None:
    response = send_request("not_a_real_method")
    assert "error" in response
    error = response["error"]
    assert error["code"] == "METHOD_NOT_FOUND"
    assert "message" in error
