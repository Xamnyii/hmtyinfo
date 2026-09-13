"""Adapters for the official CSV ZIP and SQLite estate formats."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import sqlite3
import zipfile
from collections import defaultdict
from pathlib import Path
from types import MappingProxyType
from typing import Iterable, Mapping, Protocol

from forensic_models import (
    BankTransaction,
    CompanyRfcInferenceEvidence,
    Contract,
    EfosEntry,
    Employee,
    EstateIndexes,
    Invoice,
    LedgerEntry,
    NormalizedEstate,
    PurchaseOrder,
    Vendor,
)


TABLE_COLUMNS: Mapping[str, tuple[str, ...]] = {
    "vendors": ("rfc", "legal_name", "registered_date", "address", "bank_clabe", "category", "contact_email"),
    "invoices": ("uuid", "issuer_rfc", "receiver_rfc", "issue_date", "subtotal", "iva", "total", "concepto_text", "uso_cfdi", "forma_pago", "metodo_pago", "status"),
    "ledger": ("entry_id", "date", "account_code", "account_name", "debit", "credit", "description", "invoice_uuid", "cost_center", "approver"),
    "bank_txns": ("txn_id", "date", "from_clabe", "to_clabe", "amount", "reference", "channel"),
    "purchase_orders": ("po_id", "vendor_rfc", "date", "amount", "requester", "approver", "description"),
    "contracts": ("contract_id", "vendor_rfc", "start_date", "value", "scope_text"),
    "employees": ("emp_id", "name", "role", "bank_clabe", "hire_date"),
    "efos_list": ("rfc", "legal_name", "status", "publication_date"),
}


class EstateLoadError(ValueError):
    """A controlled error caused by an invalid official estate source."""


class EstateSource(Protocol):
    def load(self, path: Path, seed: int) -> NormalizedEstate:
        """Load an estate from the declared source format."""


def _text(row: Mapping[str, object], field: str) -> str:
    value = row.get(field)
    return "" if value is None else str(value).strip()


def _required(row: Mapping[str, object], field: str, table: str) -> str:
    value = _text(row, field)
    if not value:
        raise EstateLoadError(f"{table}.{field} debe tener un valor.")
    return value


def _record_id(row: Mapping[str, object], field: str, table: str) -> str:
    value = row.get(field)
    result = "" if value is None else str(value)
    if not result.strip():
        raise EstateLoadError(f"{table}.{field} debe tener un valor.")
    return result


def _rfc(row: Mapping[str, object], field: str, table: str) -> str:
    return _required(row, field, table).upper()


def _uuid(row: Mapping[str, object], field: str, table: str) -> str:
    return _required(row, field, table).upper()


def _decimal(row: Mapping[str, object], field: str, table: str):
    from decimal import Decimal, InvalidOperation

    try:
        return Decimal(_required(row, field, table))
    except InvalidOperation as error:
        raise EstateLoadError(f"{table}.{field} debe ser numérico.") from error


def _validate_rows(table: str, rows: Iterable[Mapping[str, object]]) -> list[Mapping[str, object]]:
    normalized_rows = list(rows)
    if not normalized_rows:
        return normalized_rows
    missing = set(TABLE_COLUMNS[table]) - set(normalized_rows[0])
    if missing:
        raise EstateLoadError(f"{table} no contiene columnas oficiales: {', '.join(sorted(missing))}.")
    return normalized_rows


def _canonical_digest(rows_by_table: Mapping[str, list[Mapping[str, object]]]) -> str:
    numeric_columns = {
        "invoices": {"subtotal", "iva", "total"},
        "ledger": {"debit", "credit"},
        "bank_txns": {"amount"},
        "purchase_orders": {"amount"},
        "contracts": {"value"},
    }
    rfc_columns = {"rfc", "issuer_rfc", "receiver_rfc", "vendor_rfc"}

    def normalized_value(table: str, column: str, value: object) -> str:
        if value is None:
            return ""
        if column in numeric_columns.get(table, set()):
            from decimal import Decimal
            return format(Decimal(str(value)).normalize(), "f")
        if column in rfc_columns or column in {"uuid", "invoice_uuid"}:
            return str(value).strip().upper()
        return str(value)

    normalized = {
        table: [
            {column: normalized_value(table, column, row.get(column)) for column in TABLE_COLUMNS[table]}
            for row in sorted(rows_by_table[table], key=lambda item: tuple(normalized_value(table, column, item.get(column)) for column in TABLE_COLUMNS[table]))
        ]
        for table in sorted(TABLE_COLUMNS)
    }
    content = json.dumps(normalized, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _frozen_mapping(values: Mapping[str, object]) -> Mapping[str, object]:
    return MappingProxyType(dict(sorted(values.items())))


def _group_by(items: Iterable[object], key_name: str, sort_name: str) -> Mapping[str, tuple[object, ...]]:
    grouped: dict[str, list[object]] = defaultdict(list)
    for item in items:
        grouped[str(getattr(item, key_name))].append(item)
    return MappingProxyType({
        key: tuple(sorted(group, key=lambda item: str(getattr(item, sort_name))))
        for key, group in sorted(grouped.items())
    })


def _infer_company_rfc(invoices: tuple[Invoice, ...], vendors: tuple[Vendor, ...]) -> tuple[str, tuple[CompanyRfcInferenceEvidence, ...]]:
    vendor_rfcs = {vendor.rfc for vendor in vendors}
    invoice_count: dict[str, int] = defaultdict(int)
    received_amount: dict[str, object] = defaultdict(lambda: 0)
    counterparties: dict[str, set[str]] = defaultdict(set)
    for invoice in invoices:
        invoice_count[invoice.receiver_rfc] += 1
        received_amount[invoice.receiver_rfc] = received_amount[invoice.receiver_rfc] + invoice.total
        counterparties[invoice.receiver_rfc].add(invoice.issuer_rfc)

    evidence = tuple(
        CompanyRfcInferenceEvidence(
            rfc=rfc,
            receiver_invoice_count=invoice_count[rfc],
            received_amount=received_amount[rfc],
            receiver_centrality=len(counterparties[rfc]),
            excluded_from_vendor_table=rfc not in vendor_rfcs,
            rationale=(
                f"RFC {rfc} recibe {invoice_count[rfc]} factura(s) por {received_amount[rfc]} y se conecta con "
                f"{len(counterparties[rfc])} contraparte(s); {'no' if rfc not in vendor_rfcs else 'sí'} aparece como proveedor."
            ),
        )
        for rfc in sorted(invoice_count)
    )
    if not evidence:
        return "", evidence
    selected = min(
        evidence,
        key=lambda item: (
            not item.excluded_from_vendor_table,
            -item.receiver_invoice_count,
            -item.received_amount,
            -item.receiver_centrality,
            item.rfc,
        ),
    )
    return selected.rfc, evidence


def normalize_rows(rows_by_table: Mapping[str, list[Mapping[str, object]]], seed: int, source_format: str) -> NormalizedEstate:
    for table in TABLE_COLUMNS:
        if table not in rows_by_table:
            raise EstateLoadError(f"Falta la tabla oficial {table}.")
        _validate_rows(table, rows_by_table[table])

    vendors = tuple(sorted((Vendor(
        rfc=_rfc(row, "rfc", "vendors"),
        legal_name=_text(row, "legal_name"),
        registered_date=_text(row, "registered_date"),
        address=_text(row, "address"),
        bank_clabe=_text(row, "bank_clabe"),
        category=_text(row, "category"),
        contact_email=_text(row, "contact_email"),
    ) for row in rows_by_table["vendors"]), key=lambda item: item.rfc))
    invoices = tuple(sorted((Invoice(
        uuid=_uuid(row, "uuid", "invoices"),
        issuer_rfc=_rfc(row, "issuer_rfc", "invoices"),
        receiver_rfc=_rfc(row, "receiver_rfc", "invoices"),
        issue_date=_text(row, "issue_date"),
        subtotal=_decimal(row, "subtotal", "invoices"),
        iva=_decimal(row, "iva", "invoices"),
        total=_decimal(row, "total", "invoices"),
        concepto_text=_text(row, "concepto_text"),
        uso_cfdi=_text(row, "uso_cfdi"),
        forma_pago=_text(row, "forma_pago"),
        metodo_pago=_text(row, "metodo_pago"),
        status=_text(row, "status").lower(),
    ) for row in rows_by_table["invoices"]), key=lambda item: item.uuid))
    ledger_entries = tuple(sorted((LedgerEntry(
        entry_id=_record_id(row, "entry_id", "ledger"),
        date=_text(row, "date"),
        account_code=_text(row, "account_code"),
        account_name=_text(row, "account_name"),
        debit=_decimal(row, "debit", "ledger"),
        credit=_decimal(row, "credit", "ledger"),
        description=_text(row, "description"),
        invoice_uuid=_text(row, "invoice_uuid").upper(),
        cost_center=_text(row, "cost_center"),
        approver=_text(row, "approver"),
    ) for row in rows_by_table["ledger"]), key=lambda item: item.entry_id))
    bank_transactions = tuple(sorted((BankTransaction(
        txn_id=_record_id(row, "txn_id", "bank_txns"),
        date=_text(row, "date"),
        from_clabe=_text(row, "from_clabe"),
        to_clabe=_text(row, "to_clabe"),
        amount=_decimal(row, "amount", "bank_txns"),
        reference=_text(row, "reference"),
        channel=_text(row, "channel"),
    ) for row in rows_by_table["bank_txns"]), key=lambda item: item.txn_id))
    purchase_orders = tuple(sorted((PurchaseOrder(
        po_id=_record_id(row, "po_id", "purchase_orders"),
        vendor_rfc=_rfc(row, "vendor_rfc", "purchase_orders"),
        date=_text(row, "date"),
        amount=_decimal(row, "amount", "purchase_orders"),
        requester=_text(row, "requester"),
        approver=_text(row, "approver"),
        description=_text(row, "description"),
    ) for row in rows_by_table["purchase_orders"]), key=lambda item: item.po_id))
    contracts = tuple(sorted((Contract(
        contract_id=_record_id(row, "contract_id", "contracts"),
        vendor_rfc=_rfc(row, "vendor_rfc", "contracts"),
        start_date=_text(row, "start_date"),
        value=_decimal(row, "value", "contracts"),
        scope_text=_text(row, "scope_text"),
    ) for row in rows_by_table["contracts"]), key=lambda item: item.contract_id))
    employees = tuple(sorted((Employee(
        emp_id=_record_id(row, "emp_id", "employees"),
        name=_text(row, "name"),
        role=_text(row, "role"),
        bank_clabe=_text(row, "bank_clabe"),
        hire_date=_text(row, "hire_date"),
    ) for row in rows_by_table["employees"]), key=lambda item: item.emp_id))
    efos_entries = tuple(sorted((EfosEntry(
        rfc=_rfc(row, "rfc", "efos_list"),
        legal_name=_text(row, "legal_name"),
        status=_text(row, "status").lower(),
        publication_date=_text(row, "publication_date"),
    ) for row in rows_by_table["efos_list"]), key=lambda item: item.rfc))

    indexes = EstateIndexes(
        vendor_by_rfc=_frozen_mapping({item.rfc: item for item in vendors}),
        vendor_by_clabe=_frozen_mapping({item.bank_clabe: item for item in vendors if item.bank_clabe}),
        employee_by_id=_frozen_mapping({item.emp_id: item for item in employees}),
        employee_by_clabe=_frozen_mapping({item.bank_clabe: item for item in employees if item.bank_clabe}),
        invoice_by_uuid=_frozen_mapping({item.uuid: item for item in invoices}),
        ledger_by_invoice=_group_by(ledger_entries, "invoice_uuid", "entry_id"),
        purchase_orders_by_vendor=_group_by(purchase_orders, "vendor_rfc", "po_id"),
        contracts_by_vendor=_group_by(contracts, "vendor_rfc", "contract_id"),
        bank_txns_by_from_clabe=_group_by(bank_transactions, "from_clabe", "txn_id"),
        bank_txns_by_to_clabe=_group_by(bank_transactions, "to_clabe", "txn_id"),
        efos_by_rfc=_frozen_mapping({item.rfc: item for item in efos_entries}),
    )
    company_rfc, inference_evidence = _infer_company_rfc(invoices, vendors)
    return NormalizedEstate(
        seed=seed,
        input_digest=_canonical_digest(rows_by_table),
        source_format="csv_zip" if source_format == "csv_zip" else "sqlite",
        vendors=vendors,
        invoices=invoices,
        ledger_entries=ledger_entries,
        bank_transactions=bank_transactions,
        purchase_orders=purchase_orders,
        contracts=contracts,
        employees=employees,
        efos_entries=efos_entries,
        company_rfc=company_rfc,
        company_rfc_inference_evidence=inference_evidence,
        indexes=indexes,
    )


class CsvZipEstateAdapter:
    def load(self, path: Path, seed: int) -> NormalizedEstate:
        try:
            with zipfile.ZipFile(path) as archive:
                names = {Path(name).name: name for name in archive.namelist()}
                rows_by_table: dict[str, list[Mapping[str, object]]] = {}
                for table, columns in TABLE_COLUMNS.items():
                    file_name = f"{table}.csv"
                    if file_name not in names:
                        raise EstateLoadError(f"El ZIP no contiene {file_name}.")
                    with archive.open(names[file_name]) as raw_file:
                        reader = csv.DictReader(io.TextIOWrapper(raw_file, encoding="utf-8-sig", newline=""))
                        if reader.fieldnames is None or set(columns) - set(reader.fieldnames):
                            raise EstateLoadError(f"{file_name} no contiene todos los encabezados oficiales.")
                        rows_by_table[table] = [dict(row) for row in reader]
        except zipfile.BadZipFile as error:
            raise EstateLoadError("El archivo ZIP de estate no es válido.") from error
        return normalize_rows(rows_by_table, seed, "csv_zip")


class SqliteEstateAdapter:
    def load(self, path: Path, seed: int) -> NormalizedEstate:
        try:
            connection = sqlite3.connect(path)
            connection.row_factory = sqlite3.Row
        except sqlite3.Error as error:
            raise EstateLoadError("No fue posible abrir la base SQLite del estate.") from error
        try:
            rows_by_table: dict[str, list[Mapping[str, object]]] = {}
            for table, columns in TABLE_COLUMNS.items():
                found_columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
                if set(columns) - found_columns:
                    raise EstateLoadError(f"La tabla {table} no contiene todas las columnas oficiales.")
                query = f"SELECT {', '.join(columns)} FROM {table}"
                rows_by_table[table] = [dict(row) for row in connection.execute(query).fetchall()]
        except sqlite3.Error as error:
            raise EstateLoadError("El estate SQLite no contiene las tablas oficiales esperadas.") from error
        finally:
            connection.close()
        return normalize_rows(rows_by_table, seed, "sqlite")


def load_estate(path: str | Path, seed: int) -> NormalizedEstate:
    source_path = Path(path)
    if not source_path.is_file():
        raise EstateLoadError("No se encontró el archivo del estate.")
    suffix = source_path.suffix.lower()
    if suffix == ".zip":
        return CsvZipEstateAdapter().load(source_path, seed)
    if suffix in {".db", ".sqlite", ".sqlite3"}:
        return SqliteEstateAdapter().load(source_path, seed)
    raise EstateLoadError("El estate debe ser un archivo .zip o .db.")