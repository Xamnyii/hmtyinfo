"""Deterministic forensic roles: detect, investigate, challenge, validate, export."""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Iterable, Mapping

from forensic_config import (
    AMOUNT_TOLERANCE,
    BURST_WINDOW_DAYS,
    ENGINE_VERSION,
    FLOW_RATIO_MIN,
    MAX_CYCLE_HOPS,
    MIN_KICKBACK_FLOW_RATIO,
    MIN_SPLIT_COUNT,
    REVENUE_MISMATCH_TOLERANCE,
    SIMILAR_AMOUNT_TOLERANCE,
    snapshot,
)
from forensic_models import (
    AmountReconciliation,
    AuditEvent,
    AuditRun,
    BankTransaction,
    CandidateLead,
    ChallengerReview,
    DeclinedLead,
    Evidence,
    Exhibit,
    Finding,
    MoneyTrailStep,
    NormalizedEstate,
    RunMetadata,
    SchemeType,
    Submission,
)
from forensic_tools import ForensicTools, ToolResult


RULE_CATALOG: Mapping[SchemeType, str] = {
    "phantom_vendor": "SAT Articulo 69-B",
    "kickback": "Internal control: conflict-of-interest and vendor-payment review",
    "round_tripping": "Internal control: circular funds review",
    "threshold_splitting": "Internal control: approval-limit circumvention review",
    "revenue_inflation": "Internal control: revenue recognition and reversal review",
}


@dataclass(frozen=True)
class InvestigationAssessment:
    lead: CandidateLead
    evidence: tuple[Evidence, ...]
    claimed_amount: Decimal
    narrative: str
    money_transaction_ids: tuple[str, ...]
    challenger_review: ChallengerReview


def _entity_rfc(rfc: str) -> str:
    return f"RFC:{rfc}"


def _entity_employee(emp_id: str) -> str:
    return f"EMP:{emp_id.removeprefix('EMP:')}"


def _parse_date(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _amount_is_similar(amounts: Iterable[Decimal]) -> bool:
    values = sorted(amounts)
    if not values or values[0] <= 0:
        return False
    return (values[-1] - values[0]) / values[-1] <= SIMILAR_AMOUNT_TOLERANCE


def _record_ids(*collections: Iterable[object]) -> tuple[str, ...]:
    values: list[str] = []
    for records in collections:
        for record in records:
            for field in ("rfc", "uuid", "entry_id", "txn_id", "po_id", "contract_id", "emp_id"):
                identifier = getattr(record, field, None)
                if identifier is not None:
                    values.append(str(identifier))
                    break
    return tuple(sorted(set(values)))


class ForensicAuditEngine:
    """Runs a conservative, replayable forensic analysis without network dependencies."""

    def __init__(self, estate: NormalizedEstate) -> None:
        self.estate = estate
        self.tools = ForensicTools(estate)
        self._audit_log: list[AuditEvent] = []

    def _event(self, event: str, details: str, record_ids: tuple[str, ...] = (), evidence_ids: tuple[str, ...] = ()) -> None:
        self._audit_log.append(AuditEvent(
            sequence=len(self._audit_log) + 1,
            timestamp=datetime.now().astimezone().isoformat(),
            event=event,
            details=details,
            record_ids=tuple(sorted(set(record_ids))),
            evidence_ids=tuple(sorted(set(evidence_ids))),
        ))

    def _make_lead(
        self,
        candidate_scheme: SchemeType,
        entities: Iterable[str],
        signal: str,
        score: int,
        reason: str,
        record_ids: Iterable[str],
        recommended_tools: Iterable[str],
    ) -> CandidateLead:
        return CandidateLead(
            lead_id="",
            candidate_scheme=candidate_scheme,
            entities=tuple(sorted(set(entities))),
            signal=signal,
            score=score,
            reason=reason,
            record_ids=tuple(sorted(set(record_ids))),
            recommended_tools=tuple(recommended_tools),
        )

    def _detect_phantom_vendors(self) -> list[CandidateLead]:
        leads: list[CandidateLead] = []
        for vendor in self.estate.vendors:
            efos = self.estate.indexes.efos_by_rfc.get(vendor.rfc)
            invoices = tuple(invoice for invoice in self.estate.invoices if invoice.issuer_rfc == vendor.rfc and invoice.receiver_rfc == self.estate.company_rfc)
            if not efos or not invoices:
                continue
            leads.append(self._make_lead(
                "phantom_vendor",
                (_entity_rfc(vendor.rfc), _entity_rfc(self.estate.company_rfc)),
                "efos_vendor_with_company_invoices",
                80 if efos.status == "definitivo" else 60,
                f"El proveedor aparece con estatus EFOS {efos.status} y emitió {len(invoices)} factura(s) a la empresa inferida.",
                (vendor.rfc, efos.rfc, *(invoice.uuid for invoice in invoices)),
                ("get_vendor", "get_efos_status", "get_vendor_invoices", "get_vendor_pos", "get_vendor_contracts", "get_bank_transactions"),
            ))
        return leads

    def _detect_kickbacks(self) -> list[CandidateLead]:
        leads: list[CandidateLead] = []
        for vendor in self.estate.vendors:
            if not vendor.bank_clabe:
                continue
            inbound = tuple(self.estate.indexes.bank_txns_by_to_clabe.get(vendor.bank_clabe, ()))
            outbound = tuple(self.estate.indexes.bank_txns_by_from_clabe.get(vendor.bank_clabe, ()))
            matching_employee = self.estate.indexes.employee_by_clabe.get(vendor.bank_clabe)
            payments_to_employees = tuple(
                transaction for transaction in outbound
                if transaction.to_clabe in self.estate.indexes.employee_by_clabe
            )
            if not inbound or (matching_employee is None and not payments_to_employees):
                continue
            employee = matching_employee or self.estate.indexes.employee_by_clabe[payments_to_employees[0].to_clabe]
            linked_transfers = payments_to_employees or inbound
            invoice_ids = tuple(invoice.uuid for invoice in self.estate.invoices if invoice.issuer_rfc == vendor.rfc)
            leads.append(self._make_lead(
                "kickback",
                (_entity_rfc(vendor.rfc), _entity_employee(employee.emp_id)),
                "exact_clabe_employee_link_or_vendor_employee_flow",
                85 if payments_to_employees else 65,
                "Se observó una CLABE exacta de empleado vinculada al proveedor o una transferencia desde la CLABE del proveedor hacia un empleado.",
                (vendor.rfc, employee.emp_id, *(transaction.txn_id for transaction in linked_transfers), *invoice_ids[:1]),
                ("get_vendor", "find_employee_by_clabe", "get_bank_transactions", "get_vendor_invoices", "get_vendor_pos", "get_vendor_contracts"),
            ))
        return leads

    def _find_cycles(self) -> list[tuple[BankTransaction, ...]]:
        cycles: dict[tuple[str, ...], tuple[BankTransaction, ...]] = {}
        adjacency = self.estate.indexes.bank_txns_by_from_clabe
        for first in self.estate.bank_transactions:
            def visit(current_clabe: str, path: tuple[BankTransaction, ...], visited: set[str]) -> None:
                if len(path) >= MAX_CYCLE_HOPS:
                    return
                for next_txn in adjacency.get(current_clabe, ()):
                    if next_txn.txn_id in visited:
                        continue
                    next_path = (*path, next_txn)
                    if next_txn.to_clabe == first.from_clabe and len(next_path) >= 3:
                        key = min(tuple(item.txn_id for item in next_path[index:] + next_path[:index]) for index in range(len(next_path)))
                        cycles[key] = next_path
                    else:
                        visit(next_txn.to_clabe, next_path, {*visited, next_txn.txn_id})
            visit(first.to_clabe, (first,), {first.txn_id})
        return [cycles[key] for key in sorted(cycles)]

    def _detect_round_tripping(self) -> list[CandidateLead]:
        leads: list[CandidateLead] = []
        for cycle in self._find_cycles():
            return_amount = cycle[-1].amount
            initial_amount = cycle[0].amount
            if initial_amount <= 0 or return_amount / initial_amount < FLOW_RATIO_MIN:
                continue
            entities = tuple(sorted({self.tools._entity_for_clabe(txn.from_clabe) for txn in cycle} | {self.tools._entity_for_clabe(txn.to_clabe) for txn in cycle}))
            leads.append(self._make_lead(
                "round_tripping",
                entities,
                "directed_bank_cycle",
                75,
                f"Se detectó un ciclo dirigido de {len(cycle)} transferencias con retorno de {return_amount} frente a salida inicial de {initial_amount}.",
                (transaction.txn_id for transaction in cycle),
                ("find_money_cycles", "trace_money", "get_bank_transactions", "get_vendor", "find_employee_by_clabe"),
            ))
        return leads

    def _detect_threshold_splitting(self) -> list[CandidateLead]:
        leads: list[CandidateLead] = []
        grouped: dict[tuple[str, str], list[object]] = defaultdict(list)
        for purchase_order in self.estate.purchase_orders:
            grouped[(purchase_order.vendor_rfc, purchase_order.requester)].append(purchase_order)
        for (vendor_rfc, requester), orders in sorted(grouped.items()):
            ordered = sorted(orders, key=lambda item: (item.date, item.po_id))
            for start_index, start in enumerate(ordered):
                start_date = _parse_date(start.date)
                if start_date is None:
                    continue
                window = [
                    item for item in ordered[start_index:]
                    if (item_date := _parse_date(item.date)) is not None and (item_date - start_date).days <= BURST_WINDOW_DAYS
                ]
                if len(window) < MIN_SPLIT_COUNT:
                    continue
                by_approver: dict[str, list[Decimal]] = defaultdict(list)
                for item in window:
                    if item.approver:
                        by_approver[item.approver].append(item.amount)
                if len(by_approver) < 2:
                    continue
                ranges = sorted((max(values), min(values), approver) for approver, values in by_approver.items())
                lower_max, _, _ = ranges[0]
                _, higher_min, _ = ranges[-1]
                if higher_min <= lower_max:
                    continue
                inferred_threshold = (lower_max + higher_min) / Decimal("2")
                sub_threshold = [item for item in window if item.amount <= inferred_threshold]
                if (
                    len(sub_threshold) < MIN_SPLIT_COUNT
                    or not _amount_is_similar(item.amount for item in sub_threshold)
                    or sum(item.amount for item in sub_threshold) <= inferred_threshold
                ):
                    continue
                leads.append(self._make_lead(
                    "threshold_splitting",
                    (_entity_rfc(vendor_rfc),),
                    "repeated_sub_threshold_purchase_orders",
                    70,
                    f"{len(sub_threshold)} POs del solicitante {requester} quedan bajo el umbral inferido de {inferred_threshold} y suman {sum(item.amount for item in sub_threshold)}.",
                    (item.po_id for item in sub_threshold),
                    ("get_vendor_pos", "get_vendor_contracts", "get_vendor_invoices", "get_invoice_ledger"),
                ))
                break
        return leads

    def _detect_revenue_inflation(self) -> list[CandidateLead]:
        leads: list[CandidateLead] = []
        for invoice in self.estate.invoices:
            ledger_entries = self.estate.indexes.ledger_by_invoice.get(invoice.uuid, ())
            revenue_entries = tuple(
                entry for entry in ledger_entries
                if entry.credit > 0 and any(token in f"{entry.account_name} {entry.account_code}".lower() for token in ("revenue", "ingreso", "venta"))
            )
            reversal_entries = tuple(entry for entry in ledger_entries if entry.debit >= sum(item.credit for item in revenue_entries))
            revenue_credit = sum((entry.credit for entry in revenue_entries), Decimal("0"))
            mismatch = invoice.total > 0 and abs(revenue_credit - invoice.total) / invoice.total > REVENUE_MISMATCH_TOLERANCE
            if not revenue_entries or reversal_entries or (invoice.status != "cancelado" and not mismatch):
                continue
            leads.append(self._make_lead(
                "revenue_inflation",
                (_entity_rfc(invoice.issuer_rfc), _entity_rfc(invoice.receiver_rfc)),
                "cancelled_invoice_or_material_ledger_mismatch",
                80 if invoice.status == "cancelado" else 65,
                f"La factura {invoice.uuid} está {invoice.status} y conserva crédito de ingreso sin reversión vinculada." if invoice.status == "cancelado" else f"La factura {invoice.uuid} y el crédito de ingresos difieren materialmente.",
                (invoice.uuid, *(entry.entry_id for entry in revenue_entries)),
                ("get_invoice", "get_invoice_ledger", "get_vendor", "get_bank_transactions"),
            ))
        return leads

    def detect_candidates(self) -> tuple[CandidateLead, ...]:
        raw_leads = (
            self._detect_phantom_vendors()
            + self._detect_kickbacks()
            + self._detect_round_tripping()
            + self._detect_threshold_splitting()
            + self._detect_revenue_inflation()
        )
        ordered = sorted(raw_leads, key=lambda lead: (lead.candidate_scheme, lead.entities, lead.record_ids, lead.signal))
        candidates = tuple(
            CandidateLead(
                lead_id=f"L-{index:03d}",
                candidate_scheme=lead.candidate_scheme,
                entities=lead.entities,
                signal=lead.signal,
                score=lead.score,
                reason=lead.reason,
                record_ids=lead.record_ids,
                recommended_tools=lead.recommended_tools,
            )
            for index, lead in enumerate(ordered, start=1)
        )
        for lead in candidates:
            self._event("candidate_lead", f"Detector {lead.candidate_scheme} generó {lead.lead_id}: {lead.signal}.", lead.record_ids)
        return candidates

    def _collect(self, results: Iterable[ToolResult]) -> tuple[Evidence, ...]:
        evidence_by_id: dict[str, Evidence] = {}
        for result in results:
            evidence_by_id.update({evidence.evidence_id: evidence for evidence in result.evidence})
        return tuple(sorted(evidence_by_id.values(), key=lambda item: item.evidence_id))

    def _bank_evidence(self, evidence: Iterable[Evidence]) -> tuple[Evidence, ...]:
        return tuple(item for item in evidence if item.source_table == "bank_txns")

    def _investigate_phantom(self, lead: CandidateLead) -> InvestigationAssessment:
        vendor_rfc = next(entity.removeprefix("RFC:") for entity in lead.entities if entity != _entity_rfc(self.estate.company_rfc))
        vendor = self.estate.indexes.vendor_by_rfc[vendor_rfc]
        invoices = tuple(invoice for invoice in self.estate.invoices if invoice.issuer_rfc == vendor_rfc and invoice.receiver_rfc == self.estate.company_rfc)
        results = [
            self.tools.get_vendor(vendor_rfc),
            self.tools.get_efos_status(vendor_rfc),
            self.tools.get_vendor_invoices(vendor_rfc),
            self.tools.get_vendor_pos(vendor_rfc),
            self.tools.get_vendor_contracts(vendor_rfc),
        ]
        results.extend(self.tools.get_invoice_ledger(invoice.uuid) for invoice in invoices)
        if vendor.bank_clabe:
            results.append(self.tools.get_bank_transactions(to_clabe=vendor.bank_clabe))
        evidence = self._collect(results)
        efos = self.estate.indexes.efos_by_rfc[vendor_rfc]
        contracts = self.estate.indexes.contracts_by_vendor.get(vendor_rfc, ())
        purchase_orders = self.estate.indexes.purchase_orders_by_vendor.get(vendor_rfc, ())
        invoice_total = sum((invoice.total for invoice in invoices), Decimal("0"))
        documented = contracts and purchase_orders and sum(item.amount for item in purchase_orders) >= invoice_total * Decimal("0.98")
        challenger = ChallengerReview(
            alternative_explanation="Se revisaron contratos y órdenes de compra para comprobar una relación comercial documentada.",
            evidence_ids=tuple(item.evidence_id for item in evidence if item.source_table in {"contracts", "purchase_orders"}),
            outcome="closed" if efos.status == "presunto" and documented else "survived",
            reason=(
                f"El RFC está en EFOS como presunto, pero {', '.join(item.contract_id for item in contracts)} y "
                f"{', '.join(item.po_id for item in purchase_orders)} documentan montos que cubren las facturas."
                if efos.status == "presunto" and documented
                else "El estatus EFOS y las facturas asociadas permanecen sin una explicación documental suficiente que cierre el lead."
            ),
        )
        return InvestigationAssessment(
            lead=lead,
            evidence=evidence,
            claimed_amount=invoice_total,
            narrative=f"El proveedor {vendor_rfc} emitió {len(invoices)} factura(s) a la empresa auditada y aparece en la lista EFOS con estatus {efos.status}. La conclusión requiere considerar los documentos y pagos citados.",
            money_transaction_ids=tuple(item.record_id for item in self._bank_evidence(evidence)[:1]),
            challenger_review=challenger,
        )

    def _investigate_kickback(self, lead: CandidateLead) -> InvestigationAssessment:
        vendor_rfc = next(entity.removeprefix("RFC:") for entity in lead.entities if entity.startswith("RFC:"))
        employee_id = next(entity.removeprefix("EMP:") for entity in lead.entities if entity.startswith("EMP:"))
        employee = self.estate.indexes.employee_by_id.get(employee_id) or self.estate.indexes.employee_by_id.get(f"EMP:{employee_id}")
        vendor = self.estate.indexes.vendor_by_rfc[vendor_rfc]
        results = [self.tools.get_vendor(vendor_rfc), self.tools.get_vendor_invoices(vendor_rfc), self.tools.get_vendor_pos(vendor_rfc), self.tools.get_vendor_contracts(vendor_rfc)]
        if employee:
            results.append(self.tools.find_employee_by_clabe(employee.bank_clabe))
        if vendor.bank_clabe:
            results.append(self.tools.get_bank_transactions(to_clabe=vendor.bank_clabe))
            results.append(self.tools.get_bank_transactions(from_clabe=vendor.bank_clabe))
        evidence = self._collect(results)
        employee_payments = tuple(
            transaction for transaction in self.estate.indexes.bank_txns_by_from_clabe.get(vendor.bank_clabe, ())
            if employee and transaction.to_clabe == employee.bank_clabe
        )
        exact_shared_clabe = bool(employee and employee.bank_clabe == vendor.bank_clabe)
        claimed = sum((transaction.amount for transaction in employee_payments), Decimal("0"))
        if claimed == 0 and exact_shared_clabe:
            claimed = max((transaction.amount for transaction in self.estate.indexes.bank_txns_by_to_clabe.get(vendor.bank_clabe, ())), default=Decimal("0"))
        has_flow = claimed > 0 and (employee_payments or exact_shared_clabe)
        challenger = ChallengerReview(
            alternative_explanation="Se revisaron órdenes de compra y contratos para distinguir una compra documentada de un beneficio hacia un empleado.",
            evidence_ids=tuple(item.evidence_id for item in evidence if item.source_table in {"contracts", "purchase_orders", "employees", "bank_txns"}),
            outcome="survived" if has_flow else "closed",
            reason=(
                "La coincidencia exacta de CLABE o la transferencia del proveedor al empleado persiste después de revisar los documentos comerciales."
                if has_flow
                else "No se verificó una transferencia del proveedor a la CLABE exacta de un empleado; compartir institución bancaria no es suficiente."
            ),
        )
        return InvestigationAssessment(
            lead=lead,
            evidence=evidence,
            claimed_amount=claimed,
            narrative=f"El proveedor {vendor_rfc} presenta una vinculación de CLABE exacta con el empleado {employee_id} o una transferencia verificable hacia su cuenta. Se citan solo registros bancarios y de identidad disponibles.",
            money_transaction_ids=tuple(transaction.txn_id for transaction in (employee_payments[:1] or inbound[:1])),
            challenger_review=challenger,
        )

    def _investigate_round_tripping(self, lead: CandidateLead) -> InvestigationAssessment:
        transactions = tuple(item for item in self.estate.bank_transactions if item.txn_id in set(lead.record_ids))
        results = [self.tools.find_money_cycles()]
        if transactions:
            results.append(self.tools.trace_money(transactions[0].from_clabe))
        for transaction in transactions:
            results.append(self.tools.get_bank_transactions(from_clabe=transaction.from_clabe, to_clabe=transaction.to_clabe))
            for clabe in (transaction.from_clabe, transaction.to_clabe):
                if clabe in self.estate.indexes.vendor_by_clabe:
                    results.append(self.tools.get_vendor(self.estate.indexes.vendor_by_clabe[clabe].rfc))
                if clabe in self.estate.indexes.employee_by_clabe:
                    results.append(self.tools.find_employee_by_clabe(clabe))
        evidence = self._collect(results)
        all_refunds = transactions and all("refund" in txn.reference.lower() or "reembolso" in txn.reference.lower() or "reversion" in txn.reference.lower() for txn in transactions)
        challenger = ChallengerReview(
            alternative_explanation="Se revisaron referencias de transferencia y propietarios de CLABE para identificar reembolsos documentados.",
            evidence_ids=tuple(item.evidence_id for item in evidence if item.source_table == "bank_txns"),
            outcome="closed" if all_refunds else "survived",
            reason="Las referencias de todos los pasos describen un reembolso o reversión." if all_refunds else "Las transferencias forman un ciclo conectado y no todas las referencias lo explican como reembolso o reversión.",
        )
        return InvestigationAssessment(
            lead=lead,
            evidence=evidence,
            claimed_amount=sum((transaction.amount for transaction in transactions), Decimal("0")),
            narrative=f"Se observó una ruta bancaria circular de {len(transactions)} transferencias. El finding solo se conserva si los pasos y sus propietarios se validan mediante exhibits oficiales.",
            money_transaction_ids=tuple(transaction.txn_id for transaction in transactions),
            challenger_review=challenger,
        )

    def _investigate_threshold_splitting(self, lead: CandidateLead) -> InvestigationAssessment:
        vendor_rfc = lead.entities[0].removeprefix("RFC:")
        orders = tuple(item for item in self.estate.purchase_orders if item.po_id in set(lead.record_ids))
        results = [self.tools.get_vendor_pos(vendor_rfc), self.tools.get_vendor_contracts(vendor_rfc), self.tools.get_vendor_invoices(vendor_rfc)]
        evidence = self._collect(results)
        claim = sum((order.amount for order in orders), Decimal("0"))
        contracts = self.estate.indexes.contracts_by_vendor.get(vendor_rfc, ())
        covered_contract = next((contract for contract in contracts if contract.value >= claim and contract.scope_text), None)
        challenger = ChallengerReview(
            alternative_explanation="Se revisaron contratos y el alcance de las POs para comprobar si las compras repetidas pertenecen a un acuerdo marco legítimo.",
            evidence_ids=tuple(item.evidence_id for item in evidence if item.source_table in {"contracts", "purchase_orders"}),
            outcome="closed" if covered_contract else "survived",
            reason=(
                f"El contrato {covered_contract.contract_id} cubre el monto y alcance de las POs {', '.join(order.po_id for order in orders)}."
                if covered_contract else
                "No se encontró un contrato con alcance y valor suficientes para explicar las POs sub-umbral agrupadas."
            ),
        )
        return InvestigationAssessment(
            lead=lead,
            evidence=evidence,
            claimed_amount=claim,
            narrative=f"Las órdenes de compra {', '.join(order.po_id for order in orders)} se agruparon por proveedor, solicitante y periodo; sus montos acumulan {claim} frente a un umbral inferido del patrón de aprobadores.",
            money_transaction_ids=(),
            challenger_review=challenger,
        )

    def _investigate_revenue_inflation(self, lead: CandidateLead) -> InvestigationAssessment:
        invoice_id = next(record_id for record_id in lead.record_ids if record_id in self.estate.indexes.invoice_by_uuid)
        invoice = self.estate.indexes.invoice_by_uuid[invoice_id]
        results = [self.tools.get_invoice(invoice_id), self.tools.get_invoice_ledger(invoice_id)]
        vendor = self.estate.indexes.vendor_by_rfc.get(invoice.issuer_rfc)
        if vendor:
            results.append(self.tools.get_vendor(vendor.rfc))
            if vendor.bank_clabe:
                results.append(self.tools.get_bank_transactions(to_clabe=vendor.bank_clabe))
        evidence = self._collect(results)
        ledger_entries = self.estate.indexes.ledger_by_invoice.get(invoice_id, ())
        reversal = any(entry.debit >= invoice.total * (Decimal("1") - REVENUE_MISMATCH_TOLERANCE) for entry in ledger_entries)
        ppd_unpaid = invoice.metodo_pago.upper() == "PPD" and not any(item.source_table == "bank_txns" for item in evidence)
        challenger = ChallengerReview(
            alternative_explanation="Se revisaron las pólizas ligadas, el estado CFDI y el método de pago para identificar reversión o una cuenta PPD pendiente legítima.",
            evidence_ids=tuple(item.evidence_id for item in evidence if item.source_table in {"invoices", "ledger", "bank_txns"}),
            outcome="closed" if reversal or ppd_unpaid else "survived",
            reason=(
                "Se encontró una póliza de reversión que compensa el reconocimiento de ingreso."
                if reversal else
                "La factura usa PPD y la ausencia de pago no demuestra por sí sola inflación de ingresos."
                if ppd_unpaid else
                "La factura cancelada o inconsistente conserva reconocimiento de ingreso sin reversión suficiente en las pólizas vinculadas."
            ),
        )
        return InvestigationAssessment(
            lead=lead,
            evidence=evidence,
            claimed_amount=invoice.total,
            narrative=f"La factura {invoice.uuid} tiene estado {invoice.status}; RamRod comparó su total con las pólizas de ingreso vinculadas y buscó una reversión o explicación PPD antes de validar el lead.",
            money_transaction_ids=(),
            challenger_review=challenger,
        )

    def investigate(self, lead: CandidateLead) -> InvestigationAssessment:
        self._event("investigator_opened", f"Investigator abrió {lead.lead_id} ({lead.candidate_scheme}).", lead.record_ids)
        procedures = {
            "phantom_vendor": self._investigate_phantom,
            "kickback": self._investigate_kickback,
            "round_tripping": self._investigate_round_tripping,
            "threshold_splitting": self._investigate_threshold_splitting,
            "revenue_inflation": self._investigate_revenue_inflation,
        }
        assessment = procedures[lead.candidate_scheme](lead)
        self._event(
            "investigator_evidence",
            f"Investigator reunió {len(assessment.evidence)} exhibit(s) potencial(es) para {lead.lead_id}.",
            evidence_ids=tuple(item.evidence_id for item in assessment.evidence),
        )
        return assessment

    def _exhibit_priority(self, scheme: SchemeType) -> tuple[str, ...]:
        return {
            "phantom_vendor": ("invoices", "efos_list", "vendors", "bank_txns", "ledger", "purchase_orders", "contracts"),
            "kickback": ("bank_txns", "employees", "vendors", "invoices", "purchase_orders", "contracts"),
            "round_tripping": ("bank_txns", "vendors", "employees"),
            "threshold_splitting": ("purchase_orders", "contracts", "invoices", "vendors"),
            "revenue_inflation": ("invoices", "ledger", "vendors", "bank_txns"),
        }[scheme]

    def _select_exhibits(self, assessment: InvestigationAssessment) -> tuple[Exhibit, ...]:
        order = {table: index for index, table in enumerate(self._exhibit_priority(assessment.lead.candidate_scheme))}
        sorted_evidence = sorted(
            assessment.evidence,
            key=lambda item: (order.get(item.source_table, len(order)), item.record_id, item.evidence_id),
        )
        lead_record_ids = set(assessment.lead.record_ids)
        lead_evidence = [item for item in sorted_evidence if item.record_id in lead_record_ids]
        candidates = lead_evidence if len(lead_evidence) >= 3 else [*lead_evidence, *sorted_evidence]
        selected: list[Exhibit] = []
        included_records: set[tuple[str, str]] = set()
        for evidence in candidates:
            record_key = (evidence.source_table, evidence.record_id)
            if record_key in included_records:
                continue
            selected.append(Exhibit(
                exhibit_id=f"EX-{len(selected) + 1:03d}",
                source_table=evidence.source_table,
                record_id=evidence.record_id,
                note=evidence.what_it_proves,
            ))
            included_records.add(record_key)
        return tuple(selected)

    def reconcile_finding_amount(self, claimed: Decimal, exhibits: tuple[Exhibit, ...]) -> AmountReconciliation:
        amount_sources: Mapping[str, Mapping[str, Decimal]] = {
            "invoices": {item.uuid: item.total for item in self.estate.invoices},
            "bank_txns": {item.txn_id: item.amount for item in self.estate.bank_transactions},
            "purchase_orders": {item.po_id: item.amount for item in self.estate.purchase_orders},
            "contracts": {item.contract_id: item.value for item in self.estate.contracts},
        }
        per_table: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for exhibit in exhibits:
            amount = amount_sources.get(exhibit.source_table, {}).get(exhibit.record_id)
            if amount is not None:
                per_table[exhibit.source_table] += amount
        if not per_table:
            return AmountReconciliation(claimed, {}, None, Decimal("0"), Decimal("1"), False, "FAIL: ningún exhibit pertenece a una tabla con monto oficial.")
        best_table, actual = min(per_table.items(), key=lambda item: (abs(claimed - item[1]), item[0]))
        difference_ratio = abs(claimed - actual) / max(abs(actual), Decimal("1"))
        passes = difference_ratio <= AMOUNT_TOLERANCE
        detail = "; ".join(f"{table}={amount}" for table, amount in sorted(per_table.items()))
        return AmountReconciliation(
            claimed=claimed,
            per_table=dict(sorted(per_table.items())),
            best_table=best_table,
            actual=actual,
            difference_ratio=difference_ratio,
            passes=passes,
            explanation=f"Claimed: {claimed}; {detail}; best table: {best_table}={actual}; difference: {difference_ratio:.2%}; {'PASS' if passes else 'FAIL'}.",
        )

    def _build_money_trail(self, assessment: InvestigationAssessment, exhibits: tuple[Exhibit, ...]) -> tuple[MoneyTrailStep, ...]:
        exhibit_by_record = {exhibit.record_id: exhibit.exhibit_id for exhibit in exhibits if exhibit.source_table == "bank_txns"}
        steps: list[MoneyTrailStep] = []
        for transaction_id in assessment.money_transaction_ids:
            transaction = next((item for item in self.estate.bank_transactions if item.txn_id == transaction_id), None)
            exhibit_id = exhibit_by_record.get(transaction_id)
            if transaction is None or exhibit_id is None:
                continue
            steps.append(MoneyTrailStep(
                from_entity=self.tools._entity_for_clabe(transaction.from_clabe),
                to_entity=self.tools._entity_for_clabe(transaction.to_clabe),
                amount=transaction.amount,
                date=transaction.date,
                exhibit_id=exhibit_id,
            ))
        return tuple(steps)

    def _validate_entities(self, entities: tuple[str, ...], evidence: tuple[Evidence, ...]) -> list[str]:
        supported = {entity_id for item in evidence for entity_id in item.entity_ids}
        return [entity for entity in entities if entity not in supported]

    def validate(self, assessment: InvestigationAssessment, finding_index: int) -> tuple[Finding | None, str | None]:
        lead = assessment.lead
        self._event("validator_opened", f"Validator revisa {lead.lead_id}.", lead.record_ids)
        if assessment.challenger_review.outcome != "survived":
            return None, "El Challenger cerró la hipótesis con una explicación documental específica."
        exhibits = self._select_exhibits(assessment)
        if len(exhibits) < 3:
            return None, f"El lead solo reunió {len(exhibits)} exhibits; el mínimo oficial es 3."
        unsupported_entities = self._validate_entities(lead.entities, assessment.evidence)
        if unsupported_entities:
            return None, f"No hay exhibit que vincule las entidades: {', '.join(unsupported_entities)}."
        for exhibit in exhibits:
            if not self.tools.validate_record(exhibit.source_table, exhibit.record_id).records:
                return None, f"El record ID {exhibit.source_table}.{exhibit.record_id} no existe en el estate."
        reconciliation = self.reconcile_finding_amount(assessment.claimed_amount, exhibits)
        if assessment.claimed_amount <= 0 or not reconciliation.passes:
            return None, reconciliation.explanation
        money_trail = self._build_money_trail(assessment, exhibits)
        if len(money_trail) > 1 and any(previous.to_entity != following.from_entity for previous, following in zip(money_trail, money_trail[1:])):
            return None, "Los pasos del money trail no forman una cadena conectada."
        requires_trail = lead.candidate_scheme in {"kickback", "round_tripping"}
        if requires_trail and not money_trail:
            return None, "El esquema requiere un money trail bancario exhibido."
        source_tables = {exhibit.source_table for exhibit in exhibits}
        confidence = "proven" if len(source_tables) >= 3 and (not requires_trail or money_trail) else "probable"
        finding = Finding(
            finding_id=f"F-{finding_index:03d}",
            scheme_type=lead.candidate_scheme,
            entities=lead.entities,
            narrative=assessment.narrative,
            rule_broken=RULE_CATALOG[lead.candidate_scheme],
            peso_amount=assessment.claimed_amount,
            exhibits=exhibits,
            money_trail=money_trail,
            confidence=confidence,
            reconciliation=reconciliation,
            challenger_review=assessment.challenger_review,
        )
        self._event("finding_validated", f"Validator aprobó {finding.finding_id} desde {lead.lead_id}.", tuple(item.record_id for item in exhibits), tuple(item.evidence_id for item in assessment.evidence))
        return finding, None

    def _decline(self, assessment: InvestigationAssessment, closed_by: str, reason: str, first_tool_log_index: int) -> DeclinedLead:
        evidence_ids = tuple(item.evidence_id for item in assessment.evidence)
        calls = tuple(item.tool for item in self.tools.tool_log[first_tool_log_index:])
        decline = DeclinedLead(
            lead_id=assessment.lead.lead_id,
            entity=assessment.lead.entities[0],
            signal=assessment.lead.signal,
            reason=reason,
            tool_calls_made=calls,
            closed_by=closed_by,  # type: ignore[arg-type]
            evidence_ids=evidence_ids,
        )
        self._event(f"lead_closed_by_{closed_by}", f"{assessment.lead.lead_id} cerrado: {reason}", assessment.lead.record_ids, evidence_ids)
        return decline

    def run(self) -> AuditRun:
        started_at = time.perf_counter()
        self._event("estate_loaded", f"Estate {self.estate.source_format} cargado con digest {self.estate.input_digest}.")
        self._event("estate_indexed", f"Se indexaron {len(self.estate.invoices)} facturas, {len(self.estate.bank_transactions)} transferencias y {len(self.estate.vendors)} proveedores.")
        candidates = self.detect_candidates()
        self._event("detectors_completed", f"Detección completada con {len(candidates)} candidate lead(s).")
        findings: list[Finding] = []
        declined: list[DeclinedLead] = []
        for lead in candidates:
            tool_log_start = len(self.tools.tool_log)
            assessment = self.investigate(lead)
            self._event("challenger_opened", f"Challenger revisó {lead.lead_id}: {assessment.challenger_review.alternative_explanation}", evidence_ids=assessment.challenger_review.evidence_ids)
            if assessment.challenger_review.outcome == "closed":
                declined.append(self._decline(assessment, "challenger", assessment.challenger_review.reason, tool_log_start))
                continue
            finding, error = self.validate(assessment, len(findings) + 1)
            if finding is None:
                declined.append(self._decline(assessment, "validator", error or "El Validator no aprobó el lead.", tool_log_start))
                continue
            findings.append(finding)
        wall_clock = Decimal(str(round(time.perf_counter() - started_at, 6)))
        metadata = RunMetadata(
            llm_calls=0,
            mxn_cost=Decimal("0"),
            wall_clock_seconds=wall_clock,
            cost_by_role={},
            deterministic=True,
            engine_version=ENGINE_VERSION,
            input_digest=self.estate.input_digest,
        )
        submission = Submission(
            seed=self.estate.seed,
            findings=tuple(findings),
            leads_not_pursued=tuple(declined),
            run_metadata=metadata,
        )
        validation_errors = tuple(validate_submission(submission, self.estate))
        self._event("submission_validated", f"Validación de submission: {'PASS' if not validation_errors else 'FAIL'}.")
        self._event("run_completed", f"Corrida finalizada con {len(findings)} finding(s), {len(declined)} lead(s) cerrado(s) y {len(validation_errors)} error(es) de validación.")
        return AuditRun(
            estate_summary={
                "company_rfc": self.estate.company_rfc,
                "company_rfc_inference_evidence": self.estate.company_rfc_inference_evidence,
                "source_format": self.estate.source_format,
                "input_digest": self.estate.input_digest,
                "audit_period": self._audit_period(),
                "counts": {
                    "vendors": len(self.estate.vendors), "invoices": len(self.estate.invoices), "ledger": len(self.estate.ledger_entries),
                    "bank_txns": len(self.estate.bank_transactions), "purchase_orders": len(self.estate.purchase_orders), "contracts": len(self.estate.contracts),
                    "employees": len(self.estate.employees), "efos_list": len(self.estate.efos_entries),
                },
            },
            candidate_leads=candidates,
            findings=tuple(findings),
            declined_leads=tuple(declined),
            evidence=self.tools.evidence,
            tool_log=self.tools.tool_log,
            audit_log=tuple(self._audit_log),
            submission=submission,
            config_snapshot=snapshot(),
            validation_errors=validation_errors,
        )

    def _audit_period(self) -> str:
        dates = sorted(item.issue_date for item in self.estate.invoices if item.issue_date)
        return f"{dates[0]} to {dates[-1]}" if dates else "No invoice dates available"


def validate_submission(submission: Submission, estate: NormalizedEstate) -> list[str]:
    """Internal structural and record-level gate equivalent to the public format checks."""
    errors: list[str] = []
    allowed_tables = {"ledger", "invoices", "bank_txns", "vendors", "efos_list", "purchase_orders", "contracts", "employees"}
    records_by_table: Mapping[str, set[str]] = {
        "ledger": {item.entry_id for item in estate.ledger_entries},
        "invoices": {item.uuid for item in estate.invoices},
        "bank_txns": {item.txn_id for item in estate.bank_transactions},
        "vendors": {item.rfc for item in estate.vendors},
        "efos_list": {item.rfc for item in estate.efos_entries},
        "purchase_orders": {item.po_id for item in estate.purchase_orders},
        "contracts": {item.contract_id for item in estate.contracts},
        "employees": {item.emp_id for item in estate.employees},
    }
    for finding in submission.findings:
        if finding.scheme_type not in RULE_CATALOG:
            errors.append(f"{finding.finding_id}: scheme_type no permitido.")
        if len(finding.exhibits) < 3:
            errors.append(f"{finding.finding_id}: menos de 3 exhibits.")
        if len(finding.narrative.split()) > 150:
            errors.append(f"{finding.finding_id}: narrative excede 150 palabras.")
        for entity in finding.entities:
            if ":" not in entity:
                errors.append(f"{finding.finding_id}: entity sin prefijo: {entity}.")
        exhibit_ids = {exhibit.exhibit_id for exhibit in finding.exhibits}
        for exhibit in finding.exhibits:
            if exhibit.source_table not in allowed_tables:
                errors.append(f"{finding.finding_id}: tabla no permitida {exhibit.source_table}.")
            elif exhibit.record_id not in records_by_table[exhibit.source_table]:
                errors.append(f"{finding.finding_id}: record inexistente {exhibit.source_table}.{exhibit.record_id}.")
        for step in finding.money_trail:
            if step.exhibit_id not in exhibit_ids:
                errors.append(f"{finding.finding_id}: money trail cita exhibit inexistente {step.exhibit_id}.")
        if len(finding.money_trail) > 1 and any(previous.to_entity != following.from_entity for previous, following in zip(finding.money_trail, finding.money_trail[1:])):
            errors.append(f"{finding.finding_id}: money trail no conectado.")
        if not finding.reconciliation.passes:
            errors.append(f"{finding.finding_id}: amount no reconcilia.")
    return errors


def submission_payload(submission: Submission) -> dict[str, object]:
    """Return exactly the official submission structure without internal audit fields."""
    return {
        "seed": submission.seed,
        "findings": [
            {
                "scheme_type": finding.scheme_type,
                "entities": list(finding.entities),
                "narrative": finding.narrative,
                "rule_broken": finding.rule_broken,
                "peso_amount": float(finding.peso_amount),
                "money_trail": [
                    {"from": step.from_entity, "to": step.to_entity, "amount": float(step.amount), "date": step.date, "exhibit_id": step.exhibit_id}
                    for step in finding.money_trail
                ],
                "exhibits": [
                    {"exhibit_id": exhibit.exhibit_id, "source_table": exhibit.source_table, "record_id": exhibit.record_id, "note": exhibit.note}
                    for exhibit in finding.exhibits
                ],
                "confidence": finding.confidence,
            }
            for finding in submission.findings
        ],
        "leads_not_pursued": [
            {
                "entity": lead.entity,
                "signal": lead.signal,
                "reason": lead.reason,
                "tool_calls_made": list(lead.tool_calls_made),
                "closed_by": lead.closed_by,
            }
            for lead in submission.leads_not_pursued
        ],
        "run_metadata": {
            "llm_calls": submission.run_metadata.llm_calls,
            "mxn_cost": float(submission.run_metadata.mxn_cost),
            "wall_clock_seconds": float(submission.run_metadata.wall_clock_seconds),
            "cost_by_role": {key: float(value) for key, value in submission.run_metadata.cost_by_role.items()},
            "deterministic": submission.run_metadata.deterministic,
        },
    }