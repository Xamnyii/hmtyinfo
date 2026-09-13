from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from models import (
    AnalysisMetrics,
    AnalysisSummary,
    BillingRelationship,
    CfdiInvoice,
    Entity,
    Evidence,
    Signal,
)

CONCENTRATION_MINIMUM_INVOICES = 3
CONCENTRATION_THRESHOLD = Decimal("0.80")
REPETITIVE_BILLING_MINIMUM_INVOICES = 3
REPETITIVE_BILLING_WINDOW = timedelta(days=31)
BILLING_BURST_MINIMUM_INVOICES = 3
BILLING_BURST_WINDOW = timedelta(hours=24)
SIMILAR_INVOICE_WINDOW = timedelta(days=7)
MINIMUM_OUTLIER_SAMPLE = 4
CONCEPT_TOTAL_TOLERANCE_RATIO = Decimal("0.01")
CONCEPT_TOTAL_TOLERANCE_MINIMUM = Decimal("1.00")


@dataclass(frozen=True)
class AnalysisArtifacts:
    entities: list[Entity]
    relationships: list[BillingRelationship]
    evidence: list[Evidence]
    signals: list[Signal]
    metrics: AnalysisMetrics
    summary: AnalysisSummary


def distinct(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def parse_invoice_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def amount_label(amount: Decimal | None, currency: str | None) -> str:
    if amount is None:
        return "No disponible"
    return f"{amount} {currency or ''}".strip()


def invoice_entity_ids(invoice: CfdiInvoice, entity_id_by_rfc: dict[str, str]) -> list[str]:
    return distinct(
        [
            entity_id_by_rfc.get(invoice.issuer.rfc or "", ""),
            entity_id_by_rfc.get(invoice.receiver.rfc or "", ""),
        ]
    )


def build_entities(invoices: list[CfdiInvoice]) -> tuple[list[Entity], dict[str, str]]:
    entity_by_rfc: dict[str, Entity] = {}

    for invoice in invoices:
        for party, role in ((invoice.issuer, "issuer"), (invoice.receiver, "receiver")):
            if not party.rfc:
                continue
            entity = entity_by_rfc.get(party.rfc)
            if entity is None:
                entity = Entity(entity_id=f"ENT-{len(entity_by_rfc) + 1:03d}", rfc=party.rfc, name=party.name)
                entity_by_rfc[party.rfc] = entity
            if party.name and not entity.name:
                entity.name = party.name
            if role not in entity.roles:
                entity.roles.append(role)

    entities = list(entity_by_rfc.values())
    return entities, {entity.rfc: entity.entity_id for entity in entities}


def build_evidence(invoices: list[CfdiInvoice]) -> tuple[list[Evidence], dict[str, str]]:
    evidence: list[Evidence] = []
    evidence_by_invoice: dict[str, str] = {}

    for invoice in invoices:
        evidence_id = f"E-{len(evidence) + 1:03d}"
        evidence_by_invoice[invoice.invoice_id] = evidence_id
        evidence.append(
            Evidence(
                evidence_id=evidence_id,
                evidence_type="invoice",
                source_file=invoice.source_file_name,
                invoice_id=invoice.invoice_id,
                fact=(
                    f"CFDI {invoice.invoice_id}: {invoice.issuer.rfc or 'emisor no disponible'} "
                    f"facturó a {invoice.receiver.rfc or 'receptor no disponible'} por "
                    f"{amount_label(invoice.total, invoice.currency)}."
                ),
            )
        )

    return evidence, evidence_by_invoice


def build_relationships(invoices: list[CfdiInvoice], entity_id_by_rfc: dict[str, str]) -> list[BillingRelationship]:
    grouped: dict[tuple[str, str, str | None], list[CfdiInvoice]] = defaultdict(list)
    for invoice in invoices:
        if not invoice.issuer.rfc or not invoice.receiver.rfc:
            continue
        grouped[(invoice.issuer.rfc, invoice.receiver.rfc, invoice.currency)].append(invoice)

    relationships: list[BillingRelationship] = []
    for (issuer_rfc, receiver_rfc, currency), grouped_invoices in grouped.items():
        relationships.append(
            BillingRelationship(
                relationship_id=f"REL-{len(relationships) + 1:03d}",
                issuer_entity_id=entity_id_by_rfc[issuer_rfc],
                receiver_entity_id=entity_id_by_rfc[receiver_rfc],
                invoice_ids=[invoice.invoice_id for invoice in grouped_invoices],
                invoice_count=len(grouped_invoices),
                total_invoiced=sum((invoice.total or Decimal("0")) for invoice in grouped_invoices),
                currency=currency,
            )
        )

    return relationships


def signal_factory(signals: list[Signal]):
    def add_signal(
        *,
        code: str,
        title: str,
        severity: str,
        description: str,
        entity_ids: list[str],
        invoice_ids: list[str],
        evidence_ids: list[str],
        what_it_means: str,
        what_it_does_not_prove: str = "No demuestra por sí sola la existencia de fraude.",
    ) -> None:
        signals.append(
            Signal(
                signal_id=f"SIG-{len(signals) + 1:03d}",
                code=code,
                title=title,
                severity=severity,  # type: ignore[arg-type]
                description=description,
                entity_ids=distinct(entity_ids),
                invoice_ids=distinct(invoice_ids),
                evidence_ids=distinct(evidence_ids),
                confidence=1.0,
                what_it_means=what_it_means,
                what_it_does_not_prove=what_it_does_not_prove,
            )
        )

    return add_signal


def detect_duplicate_uuids(
    invoices: list[CfdiInvoice],
    entity_id_by_rfc: dict[str, str],
    evidence_by_invoice: dict[str, str],
    add_signal,
) -> None:
    grouped: dict[str, list[CfdiInvoice]] = defaultdict(list)
    for invoice in invoices:
        if invoice.uuid:
            grouped[invoice.uuid].append(invoice)

    for uuid, matches in grouped.items():
        if len(matches) < 2:
            continue
        add_signal(
            code="DUPLICATE_UUID",
            title="UUID fiscal repetido",
            severity="HIGH",
            description=f"El UUID {uuid} aparece en {len(matches)} archivos analizados.",
            entity_ids=[entity_id for invoice in matches for entity_id in invoice_entity_ids(invoice, entity_id_by_rfc)],
            invoice_ids=[invoice.invoice_id for invoice in matches],
            evidence_ids=[evidence_by_invoice[invoice.invoice_id] for invoice in matches],
            what_it_means="El mismo identificador fiscal fue observado en más de un XML dentro del conjunto analizado.",
        )


def detect_similar_invoices(
    invoices: list[CfdiInvoice],
    entity_id_by_rfc: dict[str, str],
    evidence_by_invoice: dict[str, str],
    add_signal,
) -> None:
    grouped: dict[tuple[str, str, Decimal, str | None], list[CfdiInvoice]] = defaultdict(list)
    for invoice in invoices:
        if invoice.issuer.rfc and invoice.receiver.rfc and invoice.total is not None:
            grouped[(invoice.issuer.rfc, invoice.receiver.rfc, invoice.total, invoice.currency)].append(invoice)

    for matches in grouped.values():
        if len(matches) < 2:
            continue
        dated_matches = sorted(
            ((parse_invoice_datetime(invoice.date), invoice) for invoice in matches),
            key=lambda item: item[0] or datetime.max.replace(tzinfo=timezone.utc),
        )
        impacted_ids: list[str] = []
        for index, (date, invoice) in enumerate(dated_matches):
            if (
                date is None
                or index == 0
                or dated_matches[index - 1][0] is None
                or date - dated_matches[index - 1][0] > SIMILAR_INVOICE_WINDOW
            ):
                continue
            impacted_ids.extend([dated_matches[index - 1][1].invoice_id, invoice.invoice_id])
        impacted = distinct(impacted_ids)
        if not impacted:
            continue
        impacted_invoices = [invoice for invoice in matches if invoice.invoice_id in impacted]
        add_signal(
            code="POSSIBLE_DUPLICATE_INVOICE",
            title="Facturas posiblemente duplicadas",
            severity="MEDIUM",
            description="Se observaron facturas con emisor, receptor, total, moneda y fechas cercanas coincidentes.",
            entity_ids=[entity_id for invoice in impacted_invoices for entity_id in invoice_entity_ids(invoice, entity_id_by_rfc)],
            invoice_ids=impacted,
            evidence_ids=[evidence_by_invoice[invoice_id] for invoice_id in impacted],
            what_it_means="Hay una coincidencia documental que merece revisión operativa.",
        )


def detect_invoice_integrity_signals(
    invoices: list[CfdiInvoice],
    entity_id_by_rfc: dict[str, str],
    evidence_by_invoice: dict[str, str],
    add_signal,
) -> None:
    for invoice in invoices:
        entity_ids = invoice_entity_ids(invoice, entity_id_by_rfc)
        evidence_ids = [evidence_by_invoice[invoice.invoice_id]]
        if not invoice.uuid:
            add_signal(
                code="MISSING_FISCAL_STAMP",
                title="Timbre fiscal no disponible",
                severity="INFO",
                description="No se encontró UUID de TimbreFiscalDigital en el XML.",
                entity_ids=entity_ids,
                invoice_ids=[invoice.invoice_id],
                evidence_ids=evidence_ids,
                what_it_means="El conjunto no contiene un UUID fiscal para este comprobante.",
                what_it_does_not_prove="No determina por sí sola la validez o invalidez del documento.",
            )
        if invoice.issuer.rfc and invoice.issuer.rfc == invoice.receiver.rfc:
            add_signal(
                code="SAME_ISSUER_RECEIVER",
                title="Emisor y receptor con el mismo RFC",
                severity="MEDIUM",
                description=f"El emisor y receptor del comprobante usan el RFC {invoice.issuer.rfc}.",
                entity_ids=entity_ids,
                invoice_ids=[invoice.invoice_id],
                evidence_ids=evidence_ids,
                what_it_means="La factura vincula el mismo RFC en ambos roles declarados.",
            )

        concept_amounts = [concept.amount for concept in invoice.concepts]
        has_complete_concept_amounts = bool(concept_amounts) and all(amount is not None for amount in concept_amounts)
        if invoice.subtotal is None or not has_complete_concept_amounts:
            continue
        expected_subtotal = sum((amount or Decimal("0")) for amount in concept_amounts) - sum(
            (concept.discount or Decimal("0")) for concept in invoice.concepts
        )
        difference = abs(invoice.subtotal - expected_subtotal)
        tolerance = max(CONCEPT_TOTAL_TOLERANCE_MINIMUM, abs(invoice.subtotal) * CONCEPT_TOTAL_TOLERANCE_RATIO)
        if difference > tolerance:
            add_signal(
                code="CONCEPT_TOTAL_MISMATCH",
                title="Diferencia entre conceptos y subtotal",
                severity="MEDIUM",
                description=(
                    f"Los conceptos suman {amount_label(expected_subtotal, invoice.currency)} y el subtotal declarado es "
                    f"{amount_label(invoice.subtotal, invoice.currency)}."
                ),
                entity_ids=entity_ids,
                invoice_ids=[invoice.invoice_id],
                evidence_ids=evidence_ids,
                what_it_means="La diferencia supera la tolerancia de redondeo configurada para este análisis.",
            )


def detect_group_patterns(
    invoices: list[CfdiInvoice],
    entity_id_by_rfc: dict[str, str],
    evidence_by_invoice: dict[str, str],
    add_signal,
) -> None:
    by_issuer_currency: dict[tuple[str, str | None], list[CfdiInvoice]] = defaultdict(list)
    by_pair_currency: dict[tuple[str, str, str | None], list[CfdiInvoice]] = defaultdict(list)
    by_pair: dict[tuple[str, str], list[CfdiInvoice]] = defaultdict(list)
    for invoice in invoices:
        if invoice.issuer.rfc and invoice.receiver.rfc and invoice.total is not None:
            by_issuer_currency[(invoice.issuer.rfc, invoice.currency)].append(invoice)
            by_pair_currency[(invoice.issuer.rfc, invoice.receiver.rfc, invoice.currency)].append(invoice)
            by_pair[(invoice.issuer.rfc, invoice.receiver.rfc)].append(invoice)

    for (issuer_rfc, currency), grouped_invoices in by_issuer_currency.items():
        if len(grouped_invoices) < CONCENTRATION_MINIMUM_INVOICES:
            continue
        total = sum((invoice.total or Decimal("0")) for invoice in grouped_invoices)
        if total <= 0:
            continue
        by_receiver: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for invoice in grouped_invoices:
            by_receiver[invoice.receiver.rfc or ""] += invoice.total or Decimal("0")
        receiver_rfc, receiver_total = max(by_receiver.items(), key=lambda item: item[1])
        share = receiver_total / total
        if share >= CONCENTRATION_THRESHOLD:
            add_signal(
                code="HIGH_COUNTERPARTY_CONCENTRATION",
                title="Alta concentración en contraparte",
                severity="MEDIUM",
                description=(
                    f"{share:.0%} del monto facturado por {issuer_rfc} en {currency or 'moneda no disponible'} "
                    f"está dirigido a {receiver_rfc}."
                ),
                entity_ids=[entity_id_by_rfc[issuer_rfc], entity_id_by_rfc[receiver_rfc]],
                invoice_ids=[invoice.invoice_id for invoice in grouped_invoices],
                evidence_ids=[evidence_by_invoice[invoice.invoice_id] for invoice in grouped_invoices],
                what_it_means="Existe concentración comercial dentro del conjunto de facturas analizado.",
            )

    for (issuer_rfc, receiver_rfc, currency), grouped_invoices in by_pair_currency.items():
        amounts: dict[Decimal, list[CfdiInvoice]] = defaultdict(list)
        for invoice in grouped_invoices:
            amounts[invoice.total or Decimal("0")].append(invoice)
        for amount, matches in amounts.items():
            dates = [parse_invoice_datetime(invoice.date) for invoice in matches]
            valid_dates = [date for date in dates if date is not None]
            if len(matches) >= REPETITIVE_BILLING_MINIMUM_INVOICES and len(valid_dates) == len(matches) and max(valid_dates) - min(valid_dates) <= REPETITIVE_BILLING_WINDOW:
                add_signal(
                    code="REPETITIVE_BILLING_PATTERN",
                    title="Patrón de facturación repetitiva",
                    severity="LOW",
                    description=(
                        f"{len(matches)} facturas por {amount_label(amount, currency)} fueron emitidas entre la misma pareja comercial "
                        f"en un periodo de {REPETITIVE_BILLING_WINDOW.days} días."
                    ),
                    entity_ids=[entity_id_by_rfc[issuer_rfc], entity_id_by_rfc[receiver_rfc]],
                    invoice_ids=[invoice.invoice_id for invoice in matches],
                    evidence_ids=[evidence_by_invoice[invoice.invoice_id] for invoice in matches],
                    what_it_means="Se observó una secuencia documental repetitiva que puede requerir contexto comercial adicional.",
                )

        dated_invoices = sorted(
            ((parse_invoice_datetime(invoice.date), invoice) for invoice in grouped_invoices),
            key=lambda item: item[0] or datetime.max.replace(tzinfo=timezone.utc),
        )
        for start_index, (start, _) in enumerate(dated_invoices):
            if start is None:
                continue
            window = [
                invoice
                for date, invoice in dated_invoices[start_index:]
                if date is not None and date - start <= BILLING_BURST_WINDOW
            ]
            if len(window) >= BILLING_BURST_MINIMUM_INVOICES:
                add_signal(
                    code="BILLING_BURST",
                    title="Concentración temporal de facturación",
                    severity="LOW",
                    description=(
                        f"{len(window)} facturas entre la misma pareja comercial se emitieron en menos de "
                        f"{int(BILLING_BURST_WINDOW.total_seconds() / 3600)} horas."
                    ),
                    entity_ids=[entity_id_by_rfc[issuer_rfc], entity_id_by_rfc[receiver_rfc]],
                    invoice_ids=[invoice.invoice_id for invoice in window],
                    evidence_ids=[evidence_by_invoice[invoice.invoice_id] for invoice in window],
                    what_it_means="Existe actividad documental concentrada en un intervalo corto dentro de este conjunto.",
                )
                break

    for (issuer_rfc, receiver_rfc), grouped_invoices in by_pair.items():
        currencies = distinct([invoice.currency or "" for invoice in grouped_invoices])
        if len(currencies) > 1:
            add_signal(
                code="MIXED_RELATIONSHIP_CURRENCIES",
                title="Monedas múltiples en relación de facturación",
                severity="INFO",
                description=(
                    f"La relación entre {issuer_rfc} y {receiver_rfc} contiene facturas en "
                    f"{', '.join(currencies)}."
                ),
                entity_ids=[entity_id_by_rfc[issuer_rfc], entity_id_by_rfc[receiver_rfc]],
                invoice_ids=[invoice.invoice_id for invoice in grouped_invoices],
                evidence_ids=[evidence_by_invoice[invoice.invoice_id] for invoice in grouped_invoices],
                what_it_means="El conjunto contiene contexto multi-moneda para la misma relación comercial.",
                what_it_does_not_prove="No implica por sí sola una irregularidad.",
            )


def median(values: list[Decimal]) -> Decimal:
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / Decimal("2")


def detect_amount_outliers(
    invoices: list[CfdiInvoice],
    entity_id_by_rfc: dict[str, str],
    evidence_by_invoice: dict[str, str],
    add_signal,
) -> None:
    by_currency: dict[str | None, list[CfdiInvoice]] = defaultdict(list)
    for invoice in invoices:
        if invoice.total is not None:
            by_currency[invoice.currency].append(invoice)

    for currency, grouped_invoices in by_currency.items():
        if len(grouped_invoices) < MINIMUM_OUTLIER_SAMPLE:
            continue
        values = sorted(invoice.total for invoice in grouped_invoices if invoice.total is not None)
        middle = len(values) // 2
        lower_half = values[:middle]
        upper_half = values[middle:] if len(values) % 2 == 0 else values[middle + 1:]
        if not lower_half or not upper_half:
            continue
        first_quartile = median(lower_half)
        third_quartile = median(upper_half)
        interquartile_range = third_quartile - first_quartile
        if interquartile_range <= 0:
            continue
        lower_bound = first_quartile - Decimal("1.5") * interquartile_range
        upper_bound = third_quartile + Decimal("1.5") * interquartile_range
        outliers = [invoice for invoice in grouped_invoices if invoice.total is not None and (invoice.total < lower_bound or invoice.total > upper_bound)]
        if outliers:
            add_signal(
                code="AMOUNT_OUTLIER",
                title="Monto fuera del patrón del conjunto",
                severity="LOW",
                description=(
                    f"{len(outliers)} factura(s) en {currency or 'moneda no disponible'} quedan fuera del rango IQR "
                    f"observado en el conjunto cargado."
                ),
                entity_ids=[entity_id for invoice in outliers for entity_id in invoice_entity_ids(invoice, entity_id_by_rfc)],
                invoice_ids=[invoice.invoice_id for invoice in outliers],
                evidence_ids=[evidence_by_invoice[invoice.invoice_id] for invoice in outliers],
                what_it_means="El monto es estadísticamente inusual dentro de esta muestra limitada.",
                what_it_does_not_prove="No implica por sí solo una irregularidad ni sustituye una línea base externa.",
            )


def analyze_invoices(invoices: list[CfdiInvoice], total_files: int, invalid_files: int) -> AnalysisArtifacts:
    entities, entity_id_by_rfc = build_entities(invoices)
    relationships = build_relationships(invoices, entity_id_by_rfc)
    evidence, evidence_by_invoice = build_evidence(invoices)
    signals: list[Signal] = []
    add_signal = signal_factory(signals)

    detect_duplicate_uuids(invoices, entity_id_by_rfc, evidence_by_invoice, add_signal)
    detect_similar_invoices(invoices, entity_id_by_rfc, evidence_by_invoice, add_signal)
    detect_invoice_integrity_signals(invoices, entity_id_by_rfc, evidence_by_invoice, add_signal)
    detect_group_patterns(invoices, entity_id_by_rfc, evidence_by_invoice, add_signal)
    detect_amount_outliers(invoices, entity_id_by_rfc, evidence_by_invoice, add_signal)

    totals_by_currency: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for invoice in invoices:
        if invoice.total is not None:
            totals_by_currency[invoice.currency or "UNSPECIFIED"] += invoice.total

    severity_order = {"INFO": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}
    highest_signal = max(signals, key=lambda signal: severity_order[signal.severity], default=None)
    issuer_rfcs = {invoice.issuer.rfc for invoice in invoices if invoice.issuer.rfc}
    receiver_rfcs = {invoice.receiver.rfc for invoice in invoices if invoice.receiver.rfc}
    metrics = AnalysisMetrics(
        total_files=total_files,
        valid_files=len(invoices),
        invalid_files=invalid_files,
        invoice_count=len(invoices),
        total_amount_by_currency=dict(totals_by_currency),
        unique_entities=len(entities),
        unique_issuers=len(issuer_rfcs),
        unique_receivers=len(receiver_rfcs),
        relationship_count=len(relationships),
        signal_count=len(signals),
    )
    summary = AnalysisSummary(
        invoice_count=len(invoices),
        entity_count=len(entities),
        signal_count=len(signals),
        highest_severity=highest_signal.severity if highest_signal else None,
    )
    return AnalysisArtifacts(
        entities=entities,
        relationships=relationships,
        evidence=evidence,
        signals=signals,
        metrics=metrics,
        summary=summary,
    )