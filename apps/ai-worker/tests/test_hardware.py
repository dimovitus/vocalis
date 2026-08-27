"""Unit tests for hardware probing."""

from vocalis_worker.hardware.probe import probe_hardware


def test_probe_hardware_never_raises() -> None:
    result = probe_hardware()
    assert result.cpuCores >= 1
    assert "cpu" in result.availableBackends
    assert result.recommendedBackend in result.availableBackends


def test_probe_hardware_dict_shape() -> None:
    from vocalis_worker.hardware.probe import probe_hardware_dict

    payload = probe_hardware_dict()
    assert isinstance(payload["availableBackends"], list)
    assert isinstance(payload["onnxProviders"], list)
