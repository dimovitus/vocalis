"""Lyric + audio structure detector with confidence gating."""

from __future__ import annotations

import math
from difflib import SequenceMatcher
from typing import Any

from .base import StructureDetectionEngine
from .types import LineStructureLabel, StructureResult, StructureSection


def _norm(text: str) -> str:
    return " ".join((text or "").lower().split())


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _rms_energy(audio_path: str, start: float, end: float) -> float | None:
    try:
        import numpy as np
        import soundfile as sf
    except ImportError:
        return None

    try:
        data, sr = sf.read(audio_path, always_2d=True)
    except Exception:  # noqa: BLE001
        return None

    if sr <= 0 or data.size == 0:
        return None
    i0 = max(0, int(start * sr))
    i1 = min(data.shape[0], int(end * sr))
    if i1 <= i0:
        return 0.0
    clip = data[i0:i1].astype("float64")
    mono = clip.mean(axis=1)
    return float(math.sqrt(float(np.mean(mono * mono))))


class LyricAudioStructureEngine(StructureDetectionEngine):
    """
    Real structure cues from:

    - lyric repetition (Chorus / Hook)
    - position + uniqueness (Verse / Bridge / Intro / Outro)
    - optional audio energy gaps (Instrumental)

    Labels are applied only when confidence >= min_confidence.
    """

    @property
    def name(self) -> str:
        return "lyric-audio-structure"

    def detect(
        self,
        *,
        lines: list[dict[str, Any]],
        audio_path: str | None = None,
        min_confidence: float = 0.45,
        duration: float | None = None,
    ) -> StructureResult:
        if not lines:
            return StructureResult(
                engine=self.name,
                sections=[],
                lineLabels=[],
                overallConfidence=0.0,
                applied=False,
                raw={"reason": "no lines"},
            )

        n = len(lines)
        starts = [float(l.get("start") or 0.0) for l in lines]
        ends = [float(l.get("end") or starts[i]) for i, l in enumerate(lines)]
        texts = [str(l.get("text") or "") for l in lines]
        track_end = float(duration) if duration and duration > 0 else max(ends) if ends else 0.0

        # --- repetition clusters for Chorus ---
        clusters: list[list[int]] = []
        assigned: set[int] = set()
        for i in range(n):
            if i in assigned or not _norm(texts[i]):
                continue
            cluster = [i]
            for j in range(i + 1, n):
                if j in assigned:
                    continue
                if _sim(texts[i], texts[j]) >= 0.82:
                    cluster.append(j)
            if len(cluster) >= 2:
                for idx in cluster:
                    assigned.add(idx)
                clusters.append(sorted(cluster))

        labels: list[str | None] = [None] * n
        conf: list[float] = [0.0] * n
        chorus_idxs: set[int] = set()
        hook_idxs: set[int] = set()

        for cluster in clusters:
            avg_len = sum(len(_norm(texts[i]).split()) for i in cluster) / len(cluster)
            score = min(0.95, 0.55 + 0.12 * (len(cluster) - 1))
            # Short repeated lines → Hook; longer → Chorus
            if avg_len <= 4:
                for i in cluster:
                    labels[i] = "Hook"
                    conf[i] = score
                    hook_idxs.add(i)
            else:
                for i in cluster:
                    labels[i] = "Chorus"
                    conf[i] = score
                    chorus_idxs.add(i)

        # --- Instrumental gaps via energy ---
        instrumental_gaps: list[tuple[float, float, float]] = []
        if audio_path:
            for i in range(n - 1):
                gap_start = ends[i]
                gap_end = starts[i + 1]
                if gap_end - gap_start < 2.5:
                    continue
                energy = _rms_energy(audio_path, gap_start, gap_end)
                if energy is None:
                    continue
                if energy < 0.02:
                    instrumental_gaps.append((gap_start, gap_end, 0.75))

        # Leading silence / low energy → Intro instrumental
        if audio_path and starts and starts[0] > 3.0:
            energy = _rms_energy(audio_path, 0.0, starts[0])
            if energy is not None and energy < 0.025:
                instrumental_gaps.append((0.0, starts[0], 0.65))

        # Trailing gap → possible Outro instrumental
        if audio_path and ends and track_end - ends[-1] > 3.0:
            energy = _rms_energy(audio_path, ends[-1], track_end)
            if energy is not None and energy < 0.025:
                instrumental_gaps.append((ends[-1], track_end, 0.6))

        # --- Fill remaining lines by position relative to chorus ---
        first_chorus = min(chorus_idxs) if chorus_idxs else None
        last_chorus = max(chorus_idxs) if chorus_idxs else None

        for i in range(n):
            if labels[i] is not None:
                continue
            text = _norm(texts[i])
            if not text:
                labels[i] = None
                conf[i] = 0.0
                continue

            # Rap heuristic: dense short words (rough)
            words = text.split()
            if len(words) >= 10 and sum(len(w) for w in words) / len(words) <= 4.2:
                labels[i] = "Rap"
                conf[i] = 0.5
                continue

            if first_chorus is None:
                # No chorus detected — weak Verse labeling only in middle third
                frac = (starts[i] / track_end) if track_end > 0 else 0.5
                if frac < 0.15:
                    labels[i] = "Intro"
                    conf[i] = 0.4
                elif frac > 0.85:
                    labels[i] = "Outro"
                    conf[i] = 0.4
                else:
                    labels[i] = "Verse"
                    conf[i] = 0.42
                continue

            if i < first_chorus:
                # Before first chorus
                if i == first_chorus - 1 and first_chorus >= 1:
                    labels[i] = "Pre-Chorus"
                    conf[i] = 0.55
                elif starts[i] < max(8.0, track_end * 0.12):
                    labels[i] = "Intro"
                    conf[i] = 0.5
                else:
                    labels[i] = "Verse"
                    conf[i] = 0.6
            elif last_chorus is not None and i > last_chorus:
                if starts[i] > track_end * 0.8:
                    labels[i] = "Outro"
                    conf[i] = 0.55
                else:
                    labels[i] = "Verse"
                    conf[i] = 0.5
            else:
                # Between choruses
                # Immediately after a chorus line
                prev_is_chorus = i > 0 and labels[i - 1] == "Chorus"
                next_is_chorus = i + 1 < n and (i + 1) in chorus_idxs
                if prev_is_chorus and not next_is_chorus:
                    # unique text → Bridge; similar short → Post-Chorus
                    if len(words) <= 6 and any(
                        _sim(texts[i], texts[c]) > 0.55 for c in chorus_idxs
                    ):
                        labels[i] = "Post-Chorus"
                        conf[i] = 0.55
                    else:
                        labels[i] = "Bridge"
                        conf[i] = 0.58
                else:
                    labels[i] = "Verse"
                    conf[i] = 0.62

        # Confidence gate — drop unsure labels
        for i in range(n):
            if labels[i] is not None and conf[i] < min_confidence:
                labels[i] = None
                conf[i] = conf[i]  # keep score for transparency

        line_labels = [
            LineStructureLabel(lineIndex=i, label=labels[i], confidence=float(conf[i]))
            for i in range(n)
        ]

        # Build contiguous sections from labeled lines
        sections: list[StructureSection] = []
        i = 0
        while i < n:
            if labels[i] is None:
                i += 1
                continue
            label = labels[i]
            j = i
            idxs = []
            while j < n and labels[j] == label:
                idxs.append(j)
                j += 1
            section_conf = sum(conf[k] for k in idxs) / len(idxs)
            sections.append(
                StructureSection(
                    label=label or "Verse",
                    confidence=float(section_conf),
                    start=starts[idxs[0]],
                    end=ends[idxs[-1]],
                    lineIndexes=idxs,
                )
            )
            i = j

        # Append instrumental gaps as optional sections (no lyrics lines)
        for gap_start, gap_end, gap_conf in instrumental_gaps:
            if gap_conf < min_confidence:
                continue
            sections.append(
                StructureSection(
                    label="Instrumental",
                    confidence=gap_conf,
                    start=gap_start,
                    end=gap_end,
                    lineIndexes=[],
                )
            )

        sections.sort(key=lambda s: s.start)

        labeled = [x for x in line_labels if x.label is not None]
        overall = (
            sum(x.confidence for x in labeled) / len(labeled)
            if labeled
            else (
                sum(s.confidence for s in sections) / len(sections) if sections else 0.0
            )
        )
        # Optional overlay: only keep sections that already passed the conf gate
        applied = len(sections) > 0

        if not applied:
            # Unsure → empty structure (lyrics text/timestamps untouched)
            return StructureResult(
                engine=self.name,
                sections=[],
                lineLabels=[
                    LineStructureLabel(lineIndex=i, label=None, confidence=float(conf[i]))
                    for i in range(n)
                ],
                overallConfidence=float(overall),
                applied=False,
                raw={
                    "reason": "no sections above confidence threshold",
                    "minConfidence": min_confidence,
                    "chorusClusters": len(clusters),
                    "instrumentalGaps": len(instrumental_gaps),
                },
            )

        return StructureResult(
            engine=self.name,
            sections=sections,
            lineLabels=line_labels,
            overallConfidence=float(overall),
            applied=True,
            raw={
                "minConfidence": min_confidence,
                "chorusClusters": len(clusters),
                "instrumentalGaps": len(instrumental_gaps),
                "trackEnd": track_end,
            },
        )
