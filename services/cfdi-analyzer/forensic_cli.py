"""CLI entry point for an offline deterministic forensic audit run."""
from __future__ import annotations

import argparse

from estate_adapters import EstateLoadError
from forensic_artifacts import write_run_artifacts
from forensic_runner import run_estate


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the RamRod forensic audit engine.")
    parser.add_argument("--estate", required=True, help="Path to estate_csv.zip or estate.db")
    parser.add_argument("--seed", required=True, type=int, help="Deterministic run seed")
    parser.add_argument("--output", required=True, help="Directory for run artifacts")
    args = parser.parse_args()
    try:
        run = run_estate(args.estate, args.seed)
    except EstateLoadError as error:
        parser.error(str(error))
    paths = write_run_artifacts(run, args.output)
    if run.validation_errors:
        print("FAIL submission validation")
        for error in run.validation_errors:
            print(f"- {error}")
        return 1
    print("PASS submission validation")
    for name, path in sorted(paths.items()):
        print(f"{name}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())