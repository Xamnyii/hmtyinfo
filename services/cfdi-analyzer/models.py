from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CfdiParty(ApiModel):
    rfc: str | None = None
    name: str | None = None
    tax_regime: str | None = None
    fiscal_address: str | None = None
    cfdi_use: str | None = None


class CfdiConcept(ApiModel):
    product_service_key: str | None = None
    identification_number: str | None = None
    quantity: Decimal | None = None
    unit_key: str | None = None
    unit: str | None = None
    description: str | None = None
    unit_value: Decimal | None = None
    amount: Decimal | None = None
    discount: Decimal | None = None


class CfdiInvoice(ApiModel):
    invoice_id: str
    source_file_index: int
    source_file_name: str
    uuid: str | None = None
    version: str | None = None
    series: str | None = None
    folio: str | None = None
    date: str | None = None
    stamped_at: str | None = None
    subtotal: Decimal | None = None
    total: Decimal | None = None
    currency: str | None = None
    voucher_type: str | None = None
    payment_method: str | None = None
    payment_form: str | None = None
    expedition_place: str | None = None
    issuer: CfdiParty
    receiver: CfdiParty
    concepts: list[CfdiConcept] = Field(default_factory=list)


class AnalyzedFile(ApiModel):
    file_index: int
    name: str
    size: int
    status: Literal["parsed", "error"]
    parsed: CfdiInvoice | None = None
    error: str | None = None


class Entity(ApiModel):
    entity_id: str
    rfc: str
    name: str | None = None
    roles: list[Literal["issuer", "receiver"]] = Field(default_factory=list)


class BillingRelationship(ApiModel):
    relationship_id: str
    issuer_entity_id: str
    receiver_entity_id: str
    invoice_ids: list[str]
    invoice_count: int
    total_invoiced: Decimal
    currency: str | None = None


class Evidence(ApiModel):
    evidence_id: str
    evidence_type: Literal["invoice"]
    source_file: str
    invoice_id: str
    fact: str


Severity = Literal["INFO", "LOW", "MEDIUM", "HIGH"]


class Signal(ApiModel):
    signal_id: str
    code: str
    title: str
    severity: Severity
    description: str
    entity_ids: list[str] = Field(default_factory=list)
    invoice_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float
    what_it_means: str
    what_it_does_not_prove: str


class AnalysisMetrics(ApiModel):
    total_files: int
    valid_files: int
    invalid_files: int
    invoice_count: int
    total_amount_by_currency: dict[str, Decimal]
    unique_entities: int
    unique_issuers: int
    unique_receivers: int
    relationship_count: int
    signal_count: int


class AnalysisSummary(ApiModel):
    invoice_count: int
    entity_count: int
    signal_count: int
    highest_severity: Severity | None = None


class AnalysisResponse(ApiModel):
    files: list[AnalyzedFile]
    invoices: list[CfdiInvoice]
    entities: list[Entity]
    relationships: list[BillingRelationship]
    evidence: list[Evidence]
    signals: list[Signal]
    metrics: AnalysisMetrics
    summary: AnalysisSummary