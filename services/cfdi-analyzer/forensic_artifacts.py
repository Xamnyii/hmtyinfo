"""Offline artifact generation and replay helpers for completed forensic runs."""
from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Mapping

from forensic_engine import submission_payload
from forensic_models import AuditRun, Finding, jsonable


def run_bundle_payload(run: AuditRun) -> dict[str, object]:
    return {
        "version": run.submission.run_metadata.engine_version,
        "normalized_case_summary": jsonable(run.estate_summary),
        "candidate_leads": jsonable(run.candidate_leads),
        "declined_leads": jsonable(run.declined_leads),
        "findings": jsonable(run.findings),
        "evidence": jsonable(run.evidence),
        "tool_log": jsonable(run.tool_log),
        "audit_log": jsonable(run.audit_log),
        "metrics": jsonable(run.submission.run_metadata),
        "config_snapshot": jsonable(run.config_snapshot),
        "submission_validation": {"status": "PASS" if not run.validation_errors else "FAIL", "errors": list(run.validation_errors)},
        "submission": submission_payload(run.submission),
        "case_file_html": case_file_html(run),
    }


def _format_amount(amount: object) -> str:
    try:
        return f"${float(amount):,.2f} MXN"
    except (TypeError, ValueError):
        return "No disponible"


def _money_trail_svg(finding: Finding) -> str:
    if not finding.money_trail:
        return """<svg class=\"trail-empty\" viewBox=\"0 0 720 72\" role=\"img\" aria-label=\"No verified bank transfer trail\">
  <rect x=\"1\" y=\"1\" width=\"718\" height=\"70\" fill=\"none\" stroke=\"#7c8c82\"/>
  <text x=\"360\" y=\"42\" text-anchor=\"middle\">No verified bank transfer trail was required for this document-based finding.</text>
</svg>"""
    width = max(720, len(finding.money_trail) * 220)
    nodes: list[str] = []
    links: list[str] = []
    for index, step in enumerate(finding.money_trail):
        start_x = 25 + index * 210
        end_x = start_x + 160
        nodes.append(f"<rect x=\"{start_x}\" y=\"18\" width=\"130\" height=\"48\" fill=\"#f4f7f4\" stroke=\"#1f2b22\"/><text x=\"{start_x + 65}\" y=\"39\" text-anchor=\"middle\">{html.escape(step.from_entity)}</text><text x=\"{start_x + 65}\" y=\"55\" text-anchor=\"middle\">{html.escape(step.exhibit_id)}</text>")
        links.append(f"<path d=\"M {start_x + 130} 42 L {end_x} 42\" stroke=\"#167c45\" marker-end=\"url(#arrow)\"/><text x=\"{start_x + 145}\" y=\"22\" text-anchor=\"middle\">{_format_amount(step.amount)}</text><text x=\"{start_x + 145}\" y=\"65\" text-anchor=\"middle\">{html.escape(step.date)}</text>")
    final_step = finding.money_trail[-1]
    final_x = 25 + len(finding.money_trail) * 210
    nodes.append(f"<rect x=\"{final_x}\" y=\"18\" width=\"130\" height=\"48\" fill=\"#f4f7f4\" stroke=\"#1f2b22\"/><text x=\"{final_x + 65}\" y=\"43\" text-anchor=\"middle\">{html.escape(final_step.to_entity)}</text>")
    return f"""<svg viewBox=\"0 0 {width} 86\" role=\"img\" aria-label=\"Money trail for {html.escape(finding.finding_id)}\">
<defs><marker id=\"arrow\" markerWidth=\"8\" markerHeight=\"8\" refX=\"7\" refY=\"4\" orient=\"auto\"><path d=\"M0,0 L8,4 L0,8 Z\" fill=\"#167c45\"/></marker></defs>
{''.join(nodes)}{''.join(links)}</svg>"""


def _finding_html(finding: Finding) -> str:
    exhibits = "".join(
        f"<tr><td>{html.escape(exhibit.exhibit_id)}</td><td>{html.escape(exhibit.source_table)}</td><td>{html.escape(exhibit.record_id)}</td><td>{html.escape(exhibit.note)}</td></tr>"
        for exhibit in finding.exhibits
    )
    reconciliation = finding.reconciliation
    reconciliation_rows = "".join(
        f"<li>{html.escape(table)} exhibits: {_format_amount(amount)}</li>"
        for table, amount in sorted(reconciliation.per_table.items())
    )
    return f"""<section class=\"finding\">
<h2>{html.escape(finding.finding_id)} · {html.escape(finding.scheme_type)} · {html.escape(', '.join(finding.entities))}</h2>
<dl class=\"finding-meta\"><div><dt>Rule broken</dt><dd>{html.escape(finding.rule_broken)}</dd></div><div><dt>Amount</dt><dd>{_format_amount(finding.peso_amount)}</dd></div><div><dt>Official confidence</dt><dd>{html.escape(finding.confidence)}</dd></div></dl>
<h3>What happened</h3><p>{html.escape(finding.narrative)}</p>
<h3>Money trail</h3>{_money_trail_svg(finding)}
<h3>Exhibits</h3><table><thead><tr><th>Exhibit</th><th>Source</th><th>Record ID</th><th>What it proves</th></tr></thead><tbody>{exhibits}</tbody></table>
<h3>Reconciliation</h3><p>{html.escape(reconciliation.explanation)}</p><ul>{reconciliation_rows}</ul>
<h3>Adversarial review</h3><p>{html.escape(finding.challenger_review.alternative_explanation)}</p><p><strong>Outcome:</strong> {html.escape(finding.challenger_review.outcome)}. {html.escape(finding.challenger_review.reason)}</p>
</section>"""


def case_file_html(run: AuditRun) -> str:
    metadata = run.submission.run_metadata
    summary = run.estate_summary
    company_rfc = str(summary.get("company_rfc") or "Not inferred")
    audit_period = str(summary.get("audit_period") or "Derived from estate records")
    findings_html = "".join(_finding_html(finding) for finding in run.findings) or "<p>No validated findings met the evidence threshold.</p>"
    leads_html = "".join(
        f"<article class=\"lead\"><h3>{html.escape(lead.lead_id)} · CLOSED · {html.escape(lead.entity)}</h3><p><strong>Signal:</strong> {html.escape(lead.signal)}</p><p><strong>Reason closed:</strong> {html.escape(lead.reason)}</p><p><strong>Evidence examined:</strong> {html.escape(', '.join(lead.evidence_ids) or 'No additional evidence IDs')}</p><p><strong>Tools called:</strong> {html.escape(', '.join(lead.tool_calls_made) or 'No tool call')}</p><p><strong>Closed by:</strong> {html.escape(lead.closed_by)}</p></article>"
        for lead in run.declined_leads
    ) or "<p>No leads were closed in this run.</p>"
    total_exposure = sum((finding.peso_amount for finding in run.findings), start=0)
    confidence_summary = ", ".join(finding.confidence for finding in run.findings) or "none"
    return f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>RamRod Forensic Case File</title>
<style>
body{{font-family:Georgia,serif;color:#18231c;line-height:1.5;max-width:1024px;margin:0 auto;padding:32px;background:#fff}}h1,h2,h3{{font-family:Arial,sans-serif;letter-spacing:0}}h1{{border-bottom:3px solid #167c45;padding-bottom:12px}}h2{{margin-top:40px;border-top:1px solid #bbc7be;padding-top:22px}}table{{width:100%;border-collapse:collapse}}th,td{{border:1px solid #bbc7be;text-align:left;padding:8px;vertical-align:top}}th{{background:#eaf1eb}}dt{{font-size:11px;text-transform:uppercase;color:#526158}}dd{{margin:3px 0 16px;font-weight:600}}.header-grid,.finding-meta{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}}.finding,.lead{{margin-top:24px;padding:18px;border:1px solid #bbc7be}}svg{{width:100%;height:auto;background:#fbfdfb;font:10px Arial,sans-serif}}.trail-empty text{{fill:#526158}}@media print{{body{{padding:0}}.finding{{break-inside:avoid}}}}@media(max-width:680px){{.header-grid,.finding-meta{{grid-template-columns:1fr}}body{{padding:18px}}}}
</style></head><body>
<header><h1>RamRod Forensic Case File</h1><div class=\"header-grid\"><div><dt>Company</dt><dd>{html.escape(company_rfc)}</dd></div><div><dt>Audit period</dt><dd>{html.escape(audit_period)}</dd></div><div><dt>Seed</dt><dd>{run.submission.seed}</dd></div><div><dt>LLM calls</dt><dd>{metadata.llm_calls}</dd></div><div><dt>MXN cost</dt><dd>{_format_amount(metadata.mxn_cost)}</dd></div><div><dt>Wall-clock seconds</dt><dd>{metadata.wall_clock_seconds}</dd></div><div><dt>Deterministic</dt><dd>{str(metadata.deterministic).lower()}</dd></div><div><dt>Engine version</dt><dd>{html.escape(metadata.engine_version)}</dd></div><div><dt>Input digest</dt><dd>{html.escape(metadata.input_digest)}</dd></div></div></header>
<section><h2>Executive Summary</h2><p>RamRod evaluated the estate using deterministic detection, local evidence tools, an adversarial challenger and a record-level validator. Findings are emitted only when the evidence threshold and amount reconciliation pass.</p><table><tbody><tr><th>Findings</th><td>{len(run.findings)} ({html.escape(confidence_summary)})</td></tr><tr><th>Total exposure</th><td>{_format_amount(total_exposure)}</td></tr><tr><th>Leads investigated and closed</th><td>{len(run.declined_leads)}</td></tr></tbody></table></section>
<section><h2>Findings</h2>{findings_html}</section>
<section><h2>Leads Not Pursued</h2>{leads_html}</section>
<section><h2>Method and Limits</h2><p>RamRod normalizes the eight official estate tables, builds indexes, runs deterministic candidate detectors, investigates with local read-only tools, challenges alternative explanations and validates only record-backed findings. MCP and LLM are not required for this run.</p><p>It cannot establish facts absent from the supplied estate, infer a bank movement from an invoice, or treat a shared financial institution as an employee link. Reproduce this file by rerunning the same estate path and seed with engine version {html.escape(metadata.engine_version)}. The input digest identifies the normalized estate.</p></section>
</body></html>"""


def write_run_artifacts(run: AuditRun, output_directory: str | Path) -> dict[str, Path]:
    destination = Path(output_directory)
    destination.mkdir(parents=True, exist_ok=True)
    artifacts: Mapping[str, object] = {
        "submission.json": submission_payload(run.submission),
        "run_bundle.json": run_bundle_payload(run),
        "audit_log.json": jsonable(run.audit_log),
        "config_snapshot.json": jsonable(run.config_snapshot),
    }
    written: dict[str, Path] = {}
    for name, payload in artifacts.items():
        path = destination / name
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=True), encoding="utf-8")
        written[name] = path
    case_file = destination / "case_file.html"
    case_file.write_text(case_file_html(run), encoding="utf-8")
    written["case_file.html"] = case_file
    return written


def load_run_bundle(path: str | Path) -> dict[str, object]:
    """Load a completed bundle for offline UI replay without rerunning the engine."""
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError("El run bundle no es un JSON válido.") from error
    required = {"version", "normalized_case_summary", "findings", "evidence", "tool_log", "audit_log", "submission"}
    if not isinstance(payload, dict) or not required.issubset(payload):
        raise ValueError("El run bundle no contiene los artefactos requeridos para replay.")
    return payload