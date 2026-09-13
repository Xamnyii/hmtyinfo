"""Immutable internal models for the offline forensic audit engine."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Literal, Mapping


SourceTable = Literal[
    "ledger",
    "invoices",
    "bank_txns",
    "vendors",
    "efos_list",
    "purchase_orders",
    "contracts",
    "employees",
]
SchemeType = Literal[
    "phantom_vendor",
    "kickback",
    "round_tripping",
    "threshold_splitting",
    "revenue_inflation",
]
OfficialConfidence = Literal["proven", "probable"]
LeadClosedBy = Literal["investigator", "challenger", "validator"]
ToolStatus = Literal["running", "completed", "failed", "skipped"]


@dataclass(frozen=True)
class Vendor:
    rfc: str
    legal_name: str
    registered_date: str
    address: str
    bank_clabe: str
    category: str
    contact_email: str


@dataclass(frozen=True)
class Invoice:
    uuid: str
    issuer_rfc: str
    receiver_rfc: str
    issue_date: str
    subtotal: Decimal
    iva: Decimal
    total: Decimal
    concepto_text: str
    uso_cfdi: str
    forma_pago: str
    metodo_pago: str
    status: str


@dataclass(frozen=True)
class LedgerEntry:
    entry_id: str
    date: str
    account_code: str
    account_name: str
    debit: Decimal
    credit: Decimal
    description: str
    invoice_uuid: str
    cost_center: str
    approver: str


@dataclass(frozen=True)
class BankTransaction:
    txn_id: str
    date: str
    from_clabe: str
    to_clabe: str
    amount: Decimal
    reference: str
    channel: str


@dataclass(frozen=True)
class PurchaseOrder:
    po_id: str
    vendor_rfc: str
    date: str
    amount: Decimal
    requester: str
    approver: str
    description: str


@dataclass(frozen=True)
class Contract:
    contract_id: str
    vendor_rfc: str
    start_date: str
    value: Decimal
    scope_text: str


@dataclass(frozen=True)
class Employee:
    emp_id: str
    name: str
    role: str
    bank_clabe: str
    hire_date: str


@dataclass(frozen=True)
class EfosEntry:
    rfc: str
    legal_name: str
    status: str
    publication_date: str


@dataclass(frozen=True)
class CompanyRfcInferenceEvidence:
    rfc: str
    receiver_invoice_count: int
    received_amount: Decimal
    receiver_centrality: int
    excluded_from_vendor_table: bool
    rationale: str


@dataclass(frozen=True)
class EstateIndexes:
    vendor_by_rfc: Mapping[str, Vendor]
    vendor_by_clabe: Mapping[str, Vendor]
    employee_by_id: Mapping[str, Employee]
    employee_by_clabe: Mapping[str, Employee]
    invoice_by_uuid: Mapping[str, Invoice]
    ledger_by_invoice: Mapping[str, tuple[LedgerEntry, ...]]
    purchase_orders_by_vendor: Mapping[str, tuple[PurchaseOrder, ...]]
    contracts_by_vendor: Mapping[str, tuple[Contract, ...]]
    bank_txns_by_from_clabe: Mapping[str, tuple[BankTransaction, ...]]
    bank_txns_by_to_clabe: Mapping[str, tuple[BankTransaction, ...]]
    efos_by_rfc: Mapping[str, EfosEntry]


@dataclass(frozen=True)
class NormalizedEstate:
    seed: int
    input_digest: str
    source_format: Literal["csv_zip", "sqlite"]
    vendors: tuple[Vendor, ...]
    invoices: tuple[Invoice, ...]
    ledger_entries: tuple[LedgerEntry, ...]
    bank_transactions: tuple[BankTransaction, ...]
    purchase_orders: tuple[PurchaseOrder, ...]
    contracts: tuple[Contract, ...]
    employees: tuple[Employee, ...]
    efos_entries: tuple[EfosEntry, ...]
    company_rfc: str
    company_rfc_inference_evidence: tuple[CompanyRfcInferenceEvidence, ...]
    indexes: EstateIndexes = field(repr=False, compare=False)


@dataclass(frozen=True)
class CandidateLead:
    lead_id: str
    candidate_scheme: SchemeType
    entities: tuple[str, ...]
    signal: str
    score: int
    reason: str
    record_ids: tuple[str, ...]
    recommended_tools: tuple[str, ...]


@dataclass(frozen=True)
class Evidence:
    evidence_id: str
    source_table: SourceTable
    record_id: str
    entity_ids: tuple[str, ...]
    description: str
    amount: Decimal | None
    date: str | None
    tool: str
    what_it_proves: str
    what_it_does_not_prove: str
    confidence: Decimal


@dataclass(frozen=True)
class Exhibit:
    exhibit_id: str
    source_table: SourceTable
    record_id: str
    note: str


@dataclass(frozen=True)
class MoneyTrailStep:
    from_entity: str
    to_entity: str
    amount: Decimal
    date: str
    exhibit_id: str


@dataclass(frozen=True)
class AmountReconciliation:
    claimed: Decimal
    per_table: Mapping[str, Decimal]
    best_table: str | None
    actual: Decimal
    difference_ratio: Decimal
    passes: bool
    explanation: str


@dataclass(frozen=True)
class ChallengerReview:
    alternative_explanation: str
    evidence_ids: tuple[str, ...]
    outcome: Literal["survived", "closed"]
    reason: str


@dataclass(frozen=True)
class Finding:
    finding_id: str
    scheme_type: SchemeType
    entities: tuple[str, ...]
    narrative: str
    rule_broken: str
    peso_amount: Decimal
    exhibits: tuple[Exhibit, ...]
    money_trail: tuple[MoneyTrailStep, ...]
    confidence: OfficialConfidence
    reconciliation: AmountReconciliation
    challenger_review: ChallengerReview


@dataclass(frozen=True)
class DeclinedLead:
    lead_id: str
    entity: str
    signal: str
    reason: str
    tool_calls_made: tuple[str, ...]
    closed_by: LeadClosedBy
    evidence_ids: tuple[str, ...]


@dataclass(frozen=True)
class ToolExecution:
    execution_id: str
    tool: str
    timestamp: str
    input_summary: str
    result_summary: str
    status: ToolStatus
    entity_ids: tuple[str, ...]
    record_ids: tuple[str, ...]
    generated_evidence_ids: tuple[str, ...]
    duration_ms: int


@dataclass(frozen=True)
class AuditEvent:
    sequence: int
    timestamp: str
    event: str
    details: str
    record_ids: tuple[str, ...] = ()
    evidence_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class RunMetadata:
    llm_calls: int
    mxn_cost: Decimal
    wall_clock_seconds: Decimal
    cost_by_role: Mapping[str, Decimal]
    deterministic: bool
    engine_version: str
    input_digest: str


@dataclass(frozen=True)
class Submission:
    seed: int
    findings: tuple[Finding, ...]
    leads_not_pursued: tuple[DeclinedLead, ...]
    run_metadata: RunMetadata


@dataclass(frozen=True)
class AuditRun:
    estate_summary: Mapping[str, object]
    candidate_leads: tuple[CandidateLead, ...]
    findings: tuple[Finding, ...]
    declined_leads: tuple[DeclinedLead, ...]
    evidence: tuple[Evidence, ...]
    tool_log: tuple[ToolExecution, ...]
    audit_log: tuple[AuditEvent, ...]
    submission: Submission
    config_snapshot: Mapping[str, object]
    validation_errors: tuple[str, ...]


def jsonable(value: object) -> object:
    """Convert internal immutable objects to JSON-compatible deterministic values."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, tuple):
        return [jsonable(item) for item in value]
    if isinstance(value, list):
        return [jsonable(item) for item in value]
    if isinstance(value, Mapping):
        return {str(key): jsonable(item) for key, item in sorted(value.items(), key=lambda item: str(item[0]))}
    if hasattr(value, "__dataclass_fields__"):
        return jsonable(asdict(value))
    return value