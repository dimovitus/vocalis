#!/usr/bin/env python3
"""Vocalis AI worker — JSON-RPC over stdin/stdout."""

from __future__ import annotations

import json
import platform
import sys
import uuid
from dataclasses import asdict, dataclass
from typing import Any

from vocalis_worker import __version__ as WORKER_VERSION
from vocalis_worker.alignment import get_alignment_engine, list_alignment_engines
from vocalis_worker.correction import get_correction_engine, list_correction_engines
from vocalis_worker.separation import get_separation_engine, list_separation_engines
from vocalis_worker.structure import get_structure_engine, list_structure_engines
from vocalis_worker.resync import list_resync_engines, resync_edited_lyrics
from vocalis_worker.transcription import (
    get_transcription_engine,
    list_transcription_engines,
)
from vocalis_worker.translation import get_translation_engine, list_translation_engines
from vocalis_worker.hardware import probe_hardware_dict
from vocalis_worker.models.manager import (
    download_model,
    list_model_inventory_dict,
    remove_model,
)

WORKER_ID = str(uuid.uuid4())


def _allow_download(params: dict[str, Any] | None) -> bool:
    if not params:
        return False
    value = params.get("allowDownload")
    if value is None:
        value = params.get("allow_download")
    return bool(value)


def _data_dir(params: dict[str, Any] | None) -> str:
    if not params:
        raise ValueError("params.dataDir is required")
    data_dir = params.get("dataDir") or params.get("data_dir")
    if not data_dir or not isinstance(data_dir, str):
        raise ValueError("params.dataDir is required")
    return data_dir


@dataclass
class WorkerError:
    code: str
    message: str


@dataclass
class PingResult:
    workerId: str
    version: str
    message: str
    pythonVersion: str
    engines: list[str]
    alignmentEngines: list[str]
    separationEngines: list[str]
    correctionEngines: list[str]
    structureEngines: list[str]
    resyncEngines: list[str]
    translationEngines: list[str]


def handle_ping(_params: dict[str, Any] | None) -> PingResult:
    return PingResult(
        workerId=WORKER_ID,
        version=WORKER_VERSION,
        message="Vocalis AI worker ready",
        pythonVersion=platform.python_version(),
        engines=list_transcription_engines(),
        alignmentEngines=list_alignment_engines(),
        separationEngines=list_separation_engines(),
        correctionEngines=list_correction_engines(),
        structureEngines=list_structure_engines(),
        resyncEngines=list_resync_engines(),
        translationEngines=list_translation_engines(),
    )


def handle_transcribe(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("transcribe requires params")

    audio_path = params.get("audioPath") or params.get("audio_path")
    if not audio_path or not isinstance(audio_path, str):
        raise ValueError("params.audioPath is required")

    engine_name = params.get("engine")
    model_size = params.get("modelSize") or params.get("model_size") or "tiny"
    language = params.get("language")
    word_timestamps = bool(params.get("wordTimestamps") or params.get("word_timestamps") or False)
    download_root = params.get("downloadRoot") or params.get("download_root")
    device = params.get("device")
    compute_type = params.get("computeType") or params.get("compute_type")

    allow_download = _allow_download(params)

    engine = get_transcription_engine(engine_name if isinstance(engine_name, str) else None)
    result = engine.transcribe(
        audio_path,
        language=language if isinstance(language, str) and language else None,
        model_size=str(model_size),
        word_timestamps=word_timestamps,
        download_root=download_root if isinstance(download_root, str) else None,
        device=device if isinstance(device, str) else None,
        compute_type=compute_type if isinstance(compute_type, str) else None,
        allow_download=allow_download,
    )
    return result.to_dict()


def handle_align(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("align requires params")

    audio_path = params.get("audioPath") or params.get("audio_path")
    if not audio_path or not isinstance(audio_path, str):
        raise ValueError("params.audioPath is required")

    engine_name = params.get("engine")
    model_size = params.get("modelSize") or params.get("model_size") or "tiny"
    language = params.get("language")
    download_root = params.get("downloadRoot") or params.get("download_root")
    device = params.get("device")
    compute_type = params.get("computeType") or params.get("compute_type")
    segments = params.get("segments")
    if segments is not None and not isinstance(segments, list):
        raise ValueError("params.segments must be a list when provided")

    allow_download = _allow_download(params)

    engine = get_alignment_engine(engine_name if isinstance(engine_name, str) else None)
    result = engine.align(
        audio_path,
        language=language if isinstance(language, str) and language else None,
        model_size=str(model_size),
        segments=segments if isinstance(segments, list) else None,
        download_root=download_root if isinstance(download_root, str) else None,
        device=device if isinstance(device, str) else None,
        compute_type=compute_type if isinstance(compute_type, str) else None,
        allow_download=allow_download,
    )
    return result.to_dict()


def handle_separate(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("separate requires params")

    audio_path = params.get("audioPath") or params.get("audio_path")
    if not audio_path or not isinstance(audio_path, str):
        raise ValueError("params.audioPath is required")

    output_dir = params.get("outputDir") or params.get("output_dir")
    if not output_dir or not isinstance(output_dir, str):
        raise ValueError("params.outputDir is required")

    engine_name = params.get("engine")
    model = params.get("model") or "htdemucs"
    cache_dir = params.get("cacheDir") or params.get("cache_dir")
    providers = params.get("providers")
    precision = params.get("precision") or "fp16weights"

    allow_download = _allow_download(params)

    engine = get_separation_engine(engine_name if isinstance(engine_name, str) else None)
    result = engine.separate(
        audio_path,
        output_dir,
        model=str(model),
        cache_dir=cache_dir if isinstance(cache_dir, str) else None,
        providers=providers if isinstance(providers, str) else None,
        precision=str(precision),
        allow_download=allow_download,
    )
    return result.to_dict()


def handle_correct(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("correct requires params")

    audio_path = params.get("audioPath") or params.get("audio_path")
    if not audio_path or not isinstance(audio_path, str):
        raise ValueError("params.audioPath is required")

    lines = params.get("lines")
    if not isinstance(lines, list) or not lines:
        raise ValueError("params.lines must be a non-empty list")

    engine_name = params.get("engine")
    language = params.get("language")
    model_size = params.get("modelSize") or params.get("model_size") or "tiny"
    download_root = params.get("downloadRoot") or params.get("download_root")
    device = params.get("device")
    compute_type = params.get("computeType") or params.get("compute_type")
    threshold = params.get("lowConfidenceThreshold")
    if threshold is None:
        threshold = params.get("low_confidence_threshold", 0.35)

    allow_download = _allow_download(params)

    engine = get_correction_engine(engine_name if isinstance(engine_name, str) else None)
    result = engine.correct(
        audio_path=audio_path,
        language=language if isinstance(language, str) and language else None,
        lines=lines,
        model_size=str(model_size),
        download_root=download_root if isinstance(download_root, str) else None,
        device=device if isinstance(device, str) else None,
        compute_type=compute_type if isinstance(compute_type, str) else None,
        low_confidence_threshold=float(threshold),
        allow_download=allow_download,
    )
    return result.to_dict()


def handle_detect_structure(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("detect_structure requires params")

    lines = params.get("lines")
    if not isinstance(lines, list) or not lines:
        raise ValueError("params.lines must be a non-empty list")

    engine_name = params.get("engine")
    audio_path = params.get("audioPath") or params.get("audio_path")
    duration = params.get("duration")
    threshold = params.get("minConfidence")
    if threshold is None:
        threshold = params.get("min_confidence", 0.45)

    engine = get_structure_engine(engine_name if isinstance(engine_name, str) else None)
    result = engine.detect(
        lines=lines,
        audio_path=audio_path if isinstance(audio_path, str) else None,
        min_confidence=float(threshold),
        duration=float(duration) if isinstance(duration, (int, float)) else None,
    )
    return result.to_dict()


def handle_resync(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("resync requires params")

    audio_path = params.get("audioPath") or params.get("audio_path")
    if not audio_path or not isinstance(audio_path, str):
        raise ValueError("params.audioPath is required")

    lines = params.get("lines")
    if not isinstance(lines, list) or not lines:
        raise ValueError("params.lines is required (non-empty list)")

    engine_name = params.get("engine")
    model_size = params.get("modelSize") or params.get("model_size") or "tiny"
    language = params.get("language")
    download_root = params.get("downloadRoot") or params.get("download_root")
    device = params.get("device")
    compute_type = params.get("computeType") or params.get("compute_type")

    allow_download = _allow_download(params)

    result = resync_edited_lyrics(
        audio_path,
        lines,
        engine=engine_name if isinstance(engine_name, str) else None,
        language=language if isinstance(language, str) and language else None,
        model_size=str(model_size),
        download_root=download_root if isinstance(download_root, str) else None,
        device=device if isinstance(device, str) else None,
        compute_type=compute_type if isinstance(compute_type, str) else None,
        allow_download=allow_download,
    )
    return result.to_dict()


def handle_translate(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("translate requires params")

    lines = params.get("lines")
    if not isinstance(lines, list) or not lines:
        raise ValueError("params.lines must be a non-empty list")

    target = params.get("targetLanguage") or params.get("target_language")
    if not target or not isinstance(target, str):
        raise ValueError("params.targetLanguage is required")

    source = params.get("sourceLanguage") or params.get("source_language") or "en"
    engine_name = params.get("engine")
    mode = params.get("mode") or "natural"
    download_root = params.get("downloadRoot") or params.get("download_root")
    include = params.get("includeTransliteration")
    if include is None:
        include = params.get("include_transliteration", True)

    allow_download = _allow_download(params)

    engine = get_translation_engine(engine_name if isinstance(engine_name, str) else None)
    result = engine.translate(
        lines=lines,
        source_language=str(source),
        target_language=str(target),
        mode=str(mode),  # type: ignore[arg-type]
        include_transliteration=bool(include),
        download_root=download_root if isinstance(download_root, str) else None,
        allow_download=allow_download,
    )
    return result.to_dict()


def handle_probe_hardware(_params: dict[str, Any] | None) -> dict[str, Any]:
    return probe_hardware_dict()


def handle_list_models(params: dict[str, Any] | None) -> dict[str, Any]:
    return list_model_inventory_dict(_data_dir(params))


def handle_download_model(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("download_model requires params")
    data_dir = _data_dir(params)
    stage = params.get("stage")
    model_id = params.get("modelId") or params.get("model_id")
    if not stage or not isinstance(stage, str):
        raise ValueError("params.stage is required")
    if not model_id or not isinstance(model_id, str):
        raise ValueError("params.modelId is required")
    item = download_model(data_dir, stage, model_id)  # type: ignore[arg-type]
    return asdict(item)


def handle_remove_model(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        raise ValueError("remove_model requires params")
    data_dir = _data_dir(params)
    stage = params.get("stage")
    model_id = params.get("modelId") or params.get("model_id")
    if not stage or not isinstance(stage, str):
        raise ValueError("params.stage is required")
    if not model_id or not isinstance(model_id, str):
        raise ValueError("params.modelId is required")
    remove_model(data_dir, stage, model_id)  # type: ignore[arg-type]
    return {"removed": True, "stage": stage, "modelId": model_id}


HANDLERS = {
    "ping": handle_ping,
    "probe_hardware": handle_probe_hardware,
    "list_models": handle_list_models,
    "download_model": handle_download_model,
    "remove_model": handle_remove_model,
    "transcribe": handle_transcribe,
    "align": handle_align,
    "resync": handle_resync,
    "translate": handle_translate,
    "separate": handle_separate,
    "correct": handle_correct,
    "detect_structure": handle_detect_structure,
}


def write_response(response: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def handle_request(request: dict[str, Any]) -> None:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params")

    if not request_id or not method:
        write_response(
            {
                "id": request_id or "unknown",
                "error": asdict(WorkerError("INVALID_REQUEST", "Missing id or method")),
            }
        )
        return

    handler = HANDLERS.get(method)
    if handler is None:
        write_response(
            {
                "id": request_id,
                "error": asdict(
                    WorkerError("METHOD_NOT_FOUND", f"Unknown method: {method}")
                ),
            }
        )
        return

    try:
        started = __import__("time").perf_counter()
        result = handler(params if isinstance(params, dict) else params)
        elapsed_ms = int((__import__("time").perf_counter() - started) * 1000)
        payload = asdict(result) if hasattr(result, "__dataclass_fields__") else result
        if isinstance(payload, dict):
            payload = dict(payload)
            payload["timingMs"] = elapsed_ms
        write_response({"id": request_id, "result": payload})
    except Exception as exc:  # noqa: BLE001 — top-level worker boundary
        write_response(
            {
                "id": request_id,
                "error": asdict(WorkerError("INTERNAL_ERROR", str(exc))),
            }
        )


def main() -> None:
    for line in sys.stdin:
        trimmed = line.strip()
        if not trimmed:
            continue

        try:
            request = json.loads(trimmed)
        except json.JSONDecodeError as exc:
            write_response(
                {
                    "id": "unknown",
                    "error": asdict(
                        WorkerError("INVALID_JSON", f"Failed to parse request: {exc}")
                    ),
                }
            )
            continue

        if not isinstance(request, dict):
            write_response(
                {
                    "id": "unknown",
                    "error": asdict(WorkerError("INVALID_REQUEST", "Request must be an object")),
                }
            )
            continue

        handle_request(request)


if __name__ == "__main__":
    main()
