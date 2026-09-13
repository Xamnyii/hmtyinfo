"""Run-level orchestration that measures estate loading and deterministic analysis together."""
from __future__ import annotations

import time
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

from estate_adapters import load_estate
from forensic_engine import ForensicAuditEngine
from forensic_models import AuditRun


def run_estate(path: str | Path, seed: int) -> AuditRun:
    started_at = time.perf_counter()
    estate = load_estate(path, seed)
    run = ForensicAuditEngine(estate).run()
    elapsed = Decimal(str(round(time.perf_counter() - started_at, 6)))
    metadata = replace(run.submission.run_metadata, wall_clock_seconds=elapsed)
    submission = replace(run.submission, run_metadata=metadata)
    return replace(run, submission=submission)