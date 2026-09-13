from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVICE_DIRECTORY = ROOT / "services" / "cfdi-analyzer"
if str(SERVICE_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIRECTORY))
if str(ROOT / "evaluation") not in sys.path:
    sys.path.insert(0, str(ROOT / "evaluation"))

from estate_adapters import load_estate
from forensic_artifacts import load_run_bundle, write_run_artifacts
from forensic_engine import ForensicAuditEngine, submission_payload
from generate_estate import COMPANY_RFC, SCHEME_TYPES, generate_estate


class ForensicEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(prefix="ramrod-test-")
        self.generated = generate_estate(self.temporary_directory.name, 701, scheme_types=SCHEME_TYPES, decoy_count=3)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_csv_zip_and_sqlite_normalize_to_the_same_estate(self) -> None:
        from_zip = load_estate(self.generated.csv_zip, 701)
        from_sqlite = load_estate(self.generated.sqlite_db, 701)
        self.assertEqual(from_zip.input_digest, from_sqlite.input_digest)
        self.assertEqual(from_zip.company_rfc, COMPANY_RFC)
        self.assertEqual(from_zip.invoices, from_sqlite.invoices)

    def test_clabe_leading_zero_and_rfc_normalization_are_preserved(self) -> None:
        estate = load_estate(self.generated.csv_zip, 701)
        self.assertTrue(all(vendor.bank_clabe.startswith("0") for vendor in estate.vendors))
        self.assertTrue(all(vendor.rfc == vendor.rfc.upper() for vendor in estate.vendors))
        self.assertTrue(all(invoice.uuid == invoice.uuid.upper() for invoice in estate.invoices))

    def test_indexes_and_all_scheme_detectors_are_available(self) -> None:
        estate = load_estate(self.generated.csv_zip, 701)
        self.assertIn(next(iter(estate.vendors)).rfc, estate.indexes.vendor_by_rfc)
        run = ForensicAuditEngine(estate).run()
        candidate_schemes = {lead.candidate_scheme for lead in run.candidate_leads}
        self.assertTrue(set(SCHEME_TYPES).issubset(candidate_schemes))
        self.assertEqual([], list(run.validation_errors))

    def test_decoy_entities_are_not_findings(self) -> None:
        estate = load_estate(self.generated.csv_zip, 701)
        answer_key = json.loads(self.generated.answer_key.read_text(encoding="utf-8"))
        run = ForensicAuditEngine(estate).run()
        found_entities = {entity for finding in run.findings for entity in finding.entities}
        self.assertTrue(all(decoy["entity"] not in found_entities for decoy in answer_key["decoys"]))
        self.assertTrue(any(lead.closed_by == "challenger" for lead in run.declined_leads))

    def test_submission_records_reconcile_and_are_deterministic_except_measured_runtime(self) -> None:
        estate = load_estate(self.generated.csv_zip, 701)
        first = ForensicAuditEngine(estate).run()
        second = ForensicAuditEngine(estate).run()
        first_payload = submission_payload(first.submission)
        second_payload = submission_payload(second.submission)
        first_payload["run_metadata"]["wall_clock_seconds"] = 0
        second_payload["run_metadata"]["wall_clock_seconds"] = 0
        self.assertEqual(first_payload, second_payload)
        self.assertEqual([], list(first.validation_errors))

    def test_zero_fraud_estate_emits_empty_findings(self) -> None:
        generated = generate_estate(Path(self.temporary_directory.name) / "zero", 702, zero_fraud=True, decoy_count=0)
        run = ForensicAuditEngine(load_estate(generated.csv_zip, 702)).run()
        self.assertEqual((), run.findings)

    def test_offline_replay_loads_the_completed_run_bundle(self) -> None:
        run = ForensicAuditEngine(load_estate(self.generated.csv_zip, 701)).run()
        paths = write_run_artifacts(run, Path(self.temporary_directory.name) / "run")
        replay = load_run_bundle(paths["run_bundle.json"])
        self.assertIn("tool_log", replay)
        self.assertIn("submission", replay)

    def test_product_service_has_no_evaluation_or_answer_key_import(self) -> None:
        product_source = "\n".join(path.read_text(encoding="utf-8") for path in SERVICE_DIRECTORY.glob("*.py"))
        self.assertNotIn("evaluation", product_source)
        self.assertNotIn("ground_truth", product_source)


if __name__ == "__main__":
    unittest.main()