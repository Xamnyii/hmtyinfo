"""Held-out benchmark runner. This is the only runtime consumer of answer keys."""
from __future__ import annotations

import argparse
import csv
import json
import sys
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
SERVICE_DIRECTORY = ROOT / "services" / "cfdi-analyzer"
if str(SERVICE_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIRECTORY))

from forensic_runner import run_estate
from generate_estate import REPORTING_SEEDS, TUNING_SEEDS, generate_estate


RESULT_COLUMNS = (
    "seed",
    "schemes_planted",
    "schemes_found",
    "recall_pct",
    "decoys_planted",
    "decoys_accused",
    "false_accusation_rate_pct",
    "peso_claimed",
    "peso_actual",
    "peso_reconciles",
    "llm_calls",
    "mxn_cost",
    "wall_clock_s",
)


def _matches(finding, expected: dict[str, object]) -> bool:
    if finding.scheme_type != expected["type"]:
        return False
    expected_entities = set(expected["entities"])
    if not expected_entities.issubset(set(finding.entities)):
        return False
    supporting_records = set(expected.get("supporting_invoices", [])) | set(expected.get("supporting_txns", []))
    cited_records = {exhibit.record_id for exhibit in finding.exhibits}
    return not supporting_records or bool(supporting_records & cited_records)


def _percent(numerator: int, denominator: int) -> float:
    return round(100 * numerator / denominator, 2) if denominator else 0.0


def run_benchmark(output_directory: str | Path, seeds: Iterable[int] = REPORTING_SEEDS) -> list[dict[str, object]]:
    output = Path(output_directory)
    output.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    for seed in seeds:
        with tempfile.TemporaryDirectory(prefix=f"ramrod-{seed}-") as temporary_directory:
            generated = generate_estate(temporary_directory, seed)
            answer_key = json.loads(generated.answer_key.read_text(encoding="utf-8"))
            run = run_estate(generated.csv_zip, seed)
            expected_schemes = answer_key["schemes"]
            found = [scheme for scheme in expected_schemes if any(_matches(finding, scheme) for finding in run.findings)]
            decoys_accused = sum(
                1 for decoy in answer_key["decoys"]
                if any(decoy["entity"] in finding.entities for finding in run.findings)
            )
            peso_actual = sum((Decimal(str(scheme["peso_amount"])) for scheme in found), Decimal("0"))
            peso_claimed = sum((finding.peso_amount for finding in run.findings), Decimal("0"))
            row = {
                "seed": seed,
                "schemes_planted": len(expected_schemes),
                "schemes_found": len(found),
                "recall_pct": _percent(len(found), len(expected_schemes)),
                "decoys_planted": len(answer_key["decoys"]),
                "decoys_accused": decoys_accused,
                "false_accusation_rate_pct": _percent(decoys_accused, len(answer_key["decoys"])),
                "peso_claimed": f"{peso_claimed:.2f}",
                "peso_actual": f"{peso_actual:.2f}",
                "peso_reconciles": all(finding.reconciliation.passes for finding in run.findings),
                "llm_calls": run.submission.run_metadata.llm_calls,
                "mxn_cost": f"{run.submission.run_metadata.mxn_cost:.2f}",
                "wall_clock_s": f"{run.submission.run_metadata.wall_clock_seconds:.6f}",
            }
            rows.append(row)
    results_path = output / "results_table.csv"
    with results_path.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=RESULT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
        total_schemes = sum(int(row["schemes_planted"]) for row in rows)
        total_found = sum(int(row["schemes_found"]) for row in rows)
        total_decoys = sum(int(row["decoys_planted"]) for row in rows)
        total_accused = sum(int(row["decoys_accused"]) for row in rows)
        writer.writerow({
            "seed": "TOTAL",
            "schemes_planted": total_schemes,
            "schemes_found": total_found,
            "recall_pct": _percent(total_found, total_schemes),
            "decoys_planted": total_decoys,
            "decoys_accused": total_accused,
            "false_accusation_rate_pct": _percent(total_accused, total_decoys),
            "peso_claimed": f"{sum(Decimal(str(row['peso_claimed'])) for row in rows):.2f}",
            "peso_actual": f"{sum(Decimal(str(row['peso_actual'])) for row in rows):.2f}",
            "peso_reconciles": all(bool(row["peso_reconciles"]) for row in rows),
            "llm_calls": sum(int(row["llm_calls"]) for row in rows),
            "mxn_cost": f"{sum(Decimal(str(row['mxn_cost'])) for row in rows):.2f}",
            "wall_clock_s": f"{sum(Decimal(str(row['wall_clock_s'])) for row in rows):.6f}",
        })
    (output / "benchmark_summary.json").write_text(json.dumps({
        "tuning_seeds": TUNING_SEEDS,
        "reporting_seeds": tuple(seeds),
        "rows": rows,
    }, indent=2), encoding="utf-8")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="evaluation/benchmark-output")
    parser.add_argument("--seeds", nargs="*", type=int, default=list(REPORTING_SEEDS))
    args = parser.parse_args()
    if set(args.seeds) & set(TUNING_SEEDS):
        raise SystemExit("Los reporting seeds no pueden cruzarse con TUNING_SEEDS.")
    run_benchmark(args.output, args.seeds)
    print(f"Benchmark completed for {len(args.seeds)} held-out seeds.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())