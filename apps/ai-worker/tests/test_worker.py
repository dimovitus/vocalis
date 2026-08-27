"""Tests for Vocalis AI worker."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1] / "worker.py"


def send_request(method: str, params: dict | None = None) -> dict:
    request = {"id": "test-1", "method": method}
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
        timeout=5,
    )

    return json.loads(stdout.strip())


def test_ping_returns_typed_response() -> None:
    response = send_request("ping")

    assert response["id"] == "test-1"
    assert "result" in response

    result = response["result"]
    assert result["message"] == "Vocalis AI worker ready"
    assert result["version"] == "0.1.0"
    assert "workerId" in result
    assert "pythonVersion" in result


def test_probe_hardware_returns_capabilities() -> None:
    response = send_request("probe_hardware")

    assert response["id"] == "test-1"
    assert "result" in response
    result = response["result"]
    assert "cpu" in result["availableBackends"]
    assert isinstance(result["onnxProviders"], list)


def test_list_models_returns_inventory(tmp_path: Path) -> None:
    response = send_request("list_models", {"dataDir": str(tmp_path)})

    assert response["id"] == "test-1"
    assert "result" in response
    result = response["result"]
    assert "items" in result
    assert isinstance(result["items"], list)
    assert any(item["modelId"] == "tiny" for item in result["items"])


def test_unknown_method_returns_error() -> None:
    response = send_request("unknown_method")

    assert response["id"] == "test-1"
    assert "error" in response
    assert response["error"]["code"] == "METHOD_NOT_FOUND"
