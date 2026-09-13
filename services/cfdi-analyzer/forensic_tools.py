"""Local deterministic evidence tools used by the forensic investigation roles."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Callable, Iterable, Mapping

from forensic_config import MAX_CYCLE_HOPS
from forensic_models import (
    BankTransaction,
    Evidence,
    NormalizedEstate,
    SourceTable,
    ToolExecution,
)


@dataclass(frozen=True)
class ToolResult:
    records: tuple[object, ...]
    evidence: tuple[Evidence, ...]
    summary: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ForensicTools:
    """Read-only tools over one normalized estate with deterministic result ordering."""

    def __init__(self, estate: NormalizedEstate) -> None:
        self.estate = estate
        self._cache: dict[str, ToolResult] = {}
        self._evidence_by_record: dict[tuple[str, str], Evidence] = {}
        self._tool_log: list[ToolExecution] = []

    @property
    def evidence(self) -> tuple[Evidence, ...]:
        return tuple(sorted(self._evidence_by_record.values(), key=lambda item: item.evidence_id))

    @property
    def tool_log(self) -> tuple[ToolExecution, ...]:
        return tuple(self._tool_log)

    def _execute(
        self,
        tool: str,
        arguments: Mapping[str, object],
        entity_ids: tuple[str, ...],
        operation: Callable[[], tuple[object, ...]],
        evidence_builder: Callable[[object], Evidence | None],
    ) -> ToolResult:
        started_at = time.perf_counter()
        request_key = f"{tool}:{json.dumps(arguments, sort_keys=True, default=str, separators=(',', ':'))}"
        input_summary = ", ".join(f"{key}={value}" for key, value in sorted(arguments.items())) or "sin argumentos"
        if request_key in self._cache:
            result = self._cache[request_key]
            self._tool_log.append(ToolExecution(
                execution_id=f"TL-{len(self._tool_log) + 1:04d}",
                tool=tool,
                timestamp=_now(),
                input_summary=input_summary,
                result_summary=f"Cache: {result.summary}",
                status="completed",
                entity_ids=entity_ids,
                record_ids=tuple(self._record_id(record) for record in result.records),
                generated_evidence_ids=(),
                duration_ms=round((time.perf_counter() - started_at) * 1000),
            ))
            return result

        try:
            records = operation()
            generated_evidence: list[Evidence] = []
            for record in records:
                evidence = evidence_builder(record)
                if evidence is None:
                    continue
                record_key = (evidence.source_table, evidence.record_id)
                existing = self._evidence_by_record.get(record_key)
                if existing is None:
                    self._evidence_by_record[record_key] = evidence
                    generated_evidence.append(evidence)
                else:
                    generated_evidence.append(existing)
            result = ToolResult(
                records=records,
                evidence=tuple(generated_evidence),
                summary=f"{len(records)} registro(s) encontrado(s).",
            )
            self._cache[request_key] = result
            self._tool_log.append(ToolExecution(
                execution_id=f"TL-{len(self._tool_log) + 1:04d}",
                tool=tool,
                timestamp=_now(),
                input_summary=input_summary,
                result_summary=result.summary,
                status="completed",
                entity_ids=entity_ids,
                record_ids=tuple(self._record_id(record) for record in records),
                generated_evidence_ids=tuple(evidence.evidence_id for evidence in generated_evidence),
                duration_ms=round((time.perf_counter() - started_at) * 1000),
            ))
            return result
        except Exception as error:
            self._tool_log.append(ToolExecution(
                execution_id=f"TL-{len(self._tool_log) + 1:04d}",
                tool=tool,
                timestamp=_now(),
                input_summary=input_summary,
                result_summary=str(error),
                status="failed",
                entity_ids=entity_ids,
                record_ids=(),
                generated_evidence_ids=(),
                duration_ms=round((time.perf_counter() - started_at) * 1000),
            ))
            raise

    def _record_id(self, record: object) -> str:
        for field in ("rfc", "uuid", "entry_id", "txn_id", "po_id", "contract_id", "emp_id"):
            value = getattr(record, field, None)
            if value is not None:
                return str(value)
        return ""

    def _entity_for_clabe(self, clabe: str) -> str:
        vendor = self.estate.indexes.vendor_by_clabe.get(clabe)
        if vendor:
            return f"RFC:{vendor.rfc}"
        employee = self.estate.indexes.employee_by_clabe.get(clabe)
        if employee:
            return f"EMP:{employee.emp_id.removeprefix('EMP:')}"
        return f"CLABE:{clabe}"

    def _evidence(
        self,
        source_table: SourceTable,
        record_id: str,
        entity_ids: tuple[str, ...],
        description: str,
        amount: Decimal | None,
        date: str | None,
        tool: str,
        proves: str,
        does_not_prove: str,
        confidence: Decimal = Decimal("1"),
    ) -> Evidence:
        return Evidence(
            evidence_id=f"E-{len(self._evidence_by_record) + 1:04d}",
            source_table=source_table,
            record_id=record_id,
            entity_ids=entity_ids,
            description=description,
            amount=amount,
            date=date,
            tool=tool,
            what_it_proves=proves,
            what_it_does_not_prove=does_not_prove,
            confidence=confidence,
        )

    def get_vendor(self, rfc: str) -> ToolResult:
        normalized_rfc = rfc.strip().upper()
        return self._execute(
            "get_vendor",
            {"rfc": normalized_rfc},
            (f"RFC:{normalized_rfc}",),
            lambda: tuple(item for item in [self.estate.indexes.vendor_by_rfc.get(normalized_rfc)] if item),
            lambda vendor: self._evidence(
                "vendors", vendor.rfc, (f"RFC:{vendor.rfc}",), f"Proveedor {vendor.legal_name or vendor.rfc}.", None, vendor.registered_date,
                "get_vendor", "El proveedor existe en la tabla oficial de vendors.", "No demuestra legitimidad ni irregularidad por sí solo.",
            ),
        )

    def get_vendor_invoices(self, rfc: str) -> ToolResult:
        normalized_rfc = rfc.strip().upper()
        return self._execute(
            "get_vendor_invoices",
            {"rfc": normalized_rfc},
            (f"RFC:{normalized_rfc}",),
            lambda: tuple(sorted((invoice for invoice in self.estate.invoices if invoice.issuer_rfc == normalized_rfc), key=lambda item: item.uuid)),
            lambda invoice: self._evidence(
                "invoices", invoice.uuid, (f"RFC:{invoice.issuer_rfc}", f"RFC:{invoice.receiver_rfc}"),
                f"Factura {invoice.uuid} por {invoice.total}.", invoice.total, invoice.issue_date, "get_vendor_invoices",
                "La factura registra emisor, receptor, monto y estado.", "No prueba por sí sola que el servicio haya sido inexistente.",
            ),
        )

    def get_invoice(self, uuid: str) -> ToolResult:
        normalized_uuid = uuid.strip().upper()
        return self._execute(
            "get_invoice",
            {"uuid": normalized_uuid},
            (),
            lambda: tuple(item for item in [self.estate.indexes.invoice_by_uuid.get(normalized_uuid)] if item),
            lambda invoice: self._evidence(
                "invoices", invoice.uuid, (f"RFC:{invoice.issuer_rfc}", f"RFC:{invoice.receiver_rfc}"),
                f"Factura {invoice.uuid} por {invoice.total}.", invoice.total, invoice.issue_date, "get_invoice",
                "La factura existe y conserva sus datos fiscales oficiales.", "No prueba por sí sola la entrega ni el pago.",
            ),
        )

    def get_invoice_ledger(self, uuid: str) -> ToolResult:
        normalized_uuid = uuid.strip().upper()
        return self._execute(
            "get_invoice_ledger",
            {"uuid": normalized_uuid},
            (),
            lambda: tuple(self.estate.indexes.ledger_by_invoice.get(normalized_uuid, ())),
            lambda entry: self._evidence(
                "ledger", entry.entry_id, (), f"Póliza {entry.entry_id} vinculada a factura {entry.invoice_uuid}.",
                entry.credit if entry.credit else entry.debit, entry.date, "get_invoice_ledger",
                "La póliza registra el asiento contable asociado a la factura.", "No prueba por sí sola que el asiento sea correcto o fraudulento.",
            ),
        )

    def get_vendor_pos(self, rfc: str) -> ToolResult:
        normalized_rfc = rfc.strip().upper()
        return self._execute(
            "get_vendor_pos",
            {"rfc": normalized_rfc},
            (f"RFC:{normalized_rfc}",),
            lambda: tuple(self.estate.indexes.purchase_orders_by_vendor.get(normalized_rfc, ())),
            lambda po: self._evidence(
                "purchase_orders", po.po_id, (f"RFC:{po.vendor_rfc}",), f"Orden de compra {po.po_id} por {po.amount}.",
                po.amount, po.date, "get_vendor_pos", "La orden documenta una compra solicitada y aprobada.", "No confirma por sí sola la entrega del bien o servicio.",
            ),
        )

    def get_vendor_contracts(self, rfc: str) -> ToolResult:
        normalized_rfc = rfc.strip().upper()
        return self._execute(
            "get_vendor_contracts",
            {"rfc": normalized_rfc},
            (f"RFC:{normalized_rfc}",),
            lambda: tuple(self.estate.indexes.contracts_by_vendor.get(normalized_rfc, ())),
            lambda contract: self._evidence(
                "contracts", contract.contract_id, (f"RFC:{contract.vendor_rfc}",), f"Contrato {contract.contract_id} con valor {contract.value}.",
                contract.value, contract.start_date, "get_vendor_contracts", "El contrato documenta alcance y valor acordado.", "No prueba por sí solo el cumplimiento total del contrato.",
            ),
        )

    def get_bank_transactions(self, *, from_clabe: str | None = None, to_clabe: str | None = None) -> ToolResult:
        if not from_clabe and not to_clabe:
            raise ValueError("get_bank_transactions requiere from_clabe o to_clabe.")
        entity_ids = tuple(item for item in (self._entity_for_clabe(from_clabe) if from_clabe else "", self._entity_for_clabe(to_clabe) if to_clabe else "") if item)
        def operation() -> tuple[object, ...]:
            matches = self.estate.bank_transactions
            if from_clabe:
                matches = tuple(item for item in matches if item.from_clabe == from_clabe)
            if to_clabe:
                matches = tuple(item for item in matches if item.to_clabe == to_clabe)
            return tuple(sorted(matches, key=lambda item: (item.date, item.txn_id)))
        return self._execute(
            "get_bank_transactions", {"from_clabe": from_clabe or "", "to_clabe": to_clabe or ""}, entity_ids, operation,
            lambda txn: self._evidence(
                "bank_txns", txn.txn_id, (self._entity_for_clabe(txn.from_clabe), self._entity_for_clabe(txn.to_clabe)),
                f"Transferencia {txn.txn_id} de {txn.amount}.", txn.amount, txn.date, "get_bank_transactions",
                "La transferencia registra CLABE origen, destino, monto y fecha.", "No prueba por sí sola el propósito legítimo o ilegítimo del pago.",
            ),
        )

    def find_employee_by_clabe(self, clabe: str) -> ToolResult:
        return self._execute(
            "find_employee_by_clabe", {"clabe": clabe}, (self._entity_for_clabe(clabe),),
            lambda: tuple(item for item in [self.estate.indexes.employee_by_clabe.get(clabe)] if item),
            lambda employee: self._evidence(
                "employees", employee.emp_id, (f"EMP:{employee.emp_id.removeprefix('EMP:')}",), f"Empleado {employee.name or employee.emp_id} usa la CLABE consultada.",
                None, employee.hire_date, "find_employee_by_clabe", "La CLABE coincide exactamente con la registrada para el empleado.", "No infiere una relación solo por compartir institución bancaria.",
            ),
        )

    def get_efos_status(self, rfc: str) -> ToolResult:
        normalized_rfc = rfc.strip().upper()
        return self._execute(
            "get_efos_status", {"rfc": normalized_rfc}, (f"RFC:{normalized_rfc}",),
            lambda: tuple(item for item in [self.estate.indexes.efos_by_rfc.get(normalized_rfc)] if item),
            lambda entry: self._evidence(
                "efos_list", entry.rfc, (f"RFC:{entry.rfc}",), f"RFC listado con estatus {entry.status}.", None, entry.publication_date,
                "get_efos_status", "El RFC aparece en la lista EFOS del estate.", "La lista EFOS no basta por sí sola para establecer una acusación final.",
            ),
        )

    def search_related_entities(self, rfc: str) -> ToolResult:
        normalized_rfc = rfc.strip().upper()
        return self._execute(
            "search_related_entities", {"rfc": normalized_rfc}, (f"RFC:{normalized_rfc}",),
            lambda: tuple(sorted((invoice for invoice in self.estate.invoices if normalized_rfc in {invoice.issuer_rfc, invoice.receiver_rfc}), key=lambda item: item.uuid)),
            lambda invoice: self._evidence(
                "invoices", invoice.uuid, (f"RFC:{invoice.issuer_rfc}", f"RFC:{invoice.receiver_rfc}"),
                f"Factura {invoice.uuid} conecta los RFC registrados.", invoice.total, invoice.issue_date, "search_related_entities",
                "La factura documenta la relación de facturación entre sus partes.", "No es un movimiento bancario ni prueba una relación fuera de esa factura.",
            ),
        )

    def validate_record(self, source_table: SourceTable, record_id: str) -> ToolResult:
        collection: Mapping[str, object] = {
            "vendors": self.estate.indexes.vendor_by_rfc,
            "invoices": self.estate.indexes.invoice_by_uuid,
            "ledger": {item.entry_id: item for item in self.estate.ledger_entries},
            "bank_txns": {item.txn_id: item for item in self.estate.bank_transactions},
            "purchase_orders": {item.po_id: item for item in self.estate.purchase_orders},
            "contracts": {item.contract_id: item for item in self.estate.contracts},
            "employees": self.estate.indexes.employee_by_id,
            "efos_list": self.estate.indexes.efos_by_rfc,
        }[source_table]
        return self._execute(
            "validate_record", {"source_table": source_table, "record_id": record_id}, (),
            lambda: tuple(item for item in [collection.get(record_id)] if item), lambda _: None,
        )

    def trace_money(self, start_clabe: str, max_hops: int = MAX_CYCLE_HOPS) -> ToolResult:
        def walk(current: str, remaining: int, seen: tuple[str, ...]) -> Iterable[BankTransaction]:
            if remaining <= 0:
                return ()
            transactions = self.estate.indexes.bank_txns_by_from_clabe.get(current, ())
            result: list[BankTransaction] = []
            for transaction in transactions:
                if transaction.txn_id in seen:
                    continue
                result.append(transaction)
                result.extend(walk(transaction.to_clabe, remaining - 1, (*seen, transaction.txn_id)))
            return result
        return self._execute(
            "trace_money", {"start_clabe": start_clabe, "max_hops": max_hops}, (self._entity_for_clabe(start_clabe),),
            lambda: tuple(sorted({item.txn_id: item for item in walk(start_clabe, max_hops, ())}.values(), key=lambda item: (item.date, item.txn_id))),
            lambda txn: self._evidence(
                "bank_txns", txn.txn_id, (self._entity_for_clabe(txn.from_clabe), self._entity_for_clabe(txn.to_clabe)),
                f"Paso bancario {txn.txn_id} por {txn.amount}.", txn.amount, txn.date, "trace_money",
                "El paso es parte de una cadena posible en el grafo de transferencias.", "No prueba por sí solo un ciclo o una intención ilícita.",
            ),
        )

    def find_money_cycles(self) -> ToolResult:
        cycles: list[BankTransaction] = []
        for transaction in self.estate.bank_transactions:
            frontier = [(transaction.to_clabe, 1, {transaction.txn_id})]
            while frontier:
                current, hops, seen = frontier.pop()
                for next_txn in self.estate.indexes.bank_txns_by_from_clabe.get(current, ()):
                    if next_txn.txn_id in seen or hops >= MAX_CYCLE_HOPS:
                        continue
                    if next_txn.to_clabe == transaction.from_clabe:
                        cycles.extend([transaction, next_txn])
                    else:
                        frontier.append((next_txn.to_clabe, hops + 1, {*seen, next_txn.txn_id}))
        return self._execute(
            "find_money_cycles", {}, (),
            lambda: tuple(sorted({item.txn_id: item for item in cycles}.values(), key=lambda item: (item.date, item.txn_id))),
            lambda txn: self._evidence(
                "bank_txns", txn.txn_id, (self._entity_for_clabe(txn.from_clabe), self._entity_for_clabe(txn.to_clabe)),
                f"Transferencia candidata a ciclo {txn.txn_id}.", txn.amount, txn.date, "find_money_cycles",
                "La transferencia participa en una ruta que vuelve a su CLABE de origen dentro del límite configurado.", "No descarta por sí sola un reembolso documentado u otra explicación legítima.",
            ),
        )