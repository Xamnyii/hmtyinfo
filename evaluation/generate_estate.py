"""Deterministic synthetic estates for development and held-out evaluation."""
from __future__ import annotations

import csv
import io
import json
import random
import sqlite3
import zipfile
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Iterable, Sequence


TUNING_SEEDS = (101, 102, 103, 104, 105)
REPORTING_SEEDS = (201, 202, 203, 204, 205, 206, 207, 208, 209, 210)
COMPANY_RFC = "EMP920101AB1"
COMPANY_CLABE = "000000000000000099"
SCHEME_TYPES = ("phantom_vendor", "kickback", "round_tripping", "threshold_splitting", "revenue_inflation")

TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "vendors": ("rfc", "legal_name", "registered_date", "address", "bank_clabe", "category", "contact_email"),
    "invoices": ("uuid", "issuer_rfc", "receiver_rfc", "issue_date", "subtotal", "iva", "total", "concepto_text", "uso_cfdi", "forma_pago", "metodo_pago", "status"),
    "ledger": ("entry_id", "date", "account_code", "account_name", "debit", "credit", "description", "invoice_uuid", "cost_center", "approver"),
    "bank_txns": ("txn_id", "date", "from_clabe", "to_clabe", "amount", "reference", "channel"),
    "purchase_orders": ("po_id", "vendor_rfc", "date", "amount", "requester", "approver", "description"),
    "contracts": ("contract_id", "vendor_rfc", "start_date", "value", "scope_text"),
    "employees": ("emp_id", "name", "role", "bank_clabe", "hire_date"),
    "efos_list": ("rfc", "legal_name", "status", "publication_date"),
}

SQL_SCHEMA = """
CREATE TABLE vendors (rfc TEXT PRIMARY KEY, legal_name TEXT, registered_date TEXT, address TEXT, bank_clabe TEXT, category TEXT, contact_email TEXT);
CREATE TABLE invoices (uuid TEXT PRIMARY KEY, issuer_rfc TEXT, receiver_rfc TEXT, issue_date TEXT, subtotal REAL, iva REAL, total REAL, concepto_text TEXT, uso_cfdi TEXT, forma_pago TEXT, metodo_pago TEXT, status TEXT);
CREATE TABLE ledger (entry_id INTEGER PRIMARY KEY, date TEXT, account_code TEXT, account_name TEXT, debit REAL, credit REAL, description TEXT, invoice_uuid TEXT, cost_center TEXT, approver TEXT);
CREATE TABLE bank_txns (txn_id TEXT PRIMARY KEY, date TEXT, from_clabe TEXT, to_clabe TEXT, amount REAL, reference TEXT, channel TEXT);
CREATE TABLE purchase_orders (po_id TEXT PRIMARY KEY, vendor_rfc TEXT, date TEXT, amount REAL, requester TEXT, approver TEXT, description TEXT);
CREATE TABLE contracts (contract_id TEXT PRIMARY KEY, vendor_rfc TEXT, start_date TEXT, value REAL, scope_text TEXT);
CREATE TABLE employees (emp_id TEXT PRIMARY KEY, name TEXT, role TEXT, bank_clabe TEXT, hire_date TEXT);
CREATE TABLE efos_list (rfc TEXT PRIMARY KEY, legal_name TEXT, status TEXT, publication_date TEXT);
"""


@dataclass(frozen=True)
class GeneratedEstate:
    csv_zip: Path
    sqlite_db: Path
    answer_key: Path
    manifest: Path


def _money(value: Decimal | int | float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _as_string(value: object) -> str:
    return f"{value:.2f}" if isinstance(value, Decimal) else str(value)


class EstateBuilder:
    def __init__(self, seed: int) -> None:
        self.seed = seed
        self.random = random.Random(seed)
        self.tables: dict[str, list[dict[str, object]]] = {table: [] for table in TABLE_COLUMNS}
        self.schemes: list[dict[str, object]] = []
        self.decoys: list[dict[str, object]] = []
        self._vendor_sequence = 0
        self._invoice_sequence = 0
        self._txn_sequence = 0
        self._po_sequence = 0
        self._contract_sequence = 0
        self._ledger_sequence = 0
        self._employee_sequence = 0

    def add_vendor(self, label: str, *, clabe: str | None = None, registered_date: str = "2024-01-15") -> dict[str, object]:
        self._vendor_sequence += 1
        rfc = f"VND{self.seed:06d}{self._vendor_sequence:04d}"
        vendor = {
            "rfc": rfc,
            "legal_name": f"{label} SA de CV",
            "registered_date": registered_date,
            "address": f"Avenida {label} {self._vendor_sequence}, Monterrey",
            "bank_clabe": clabe or f"{self._vendor_sequence:018d}",
            "category": "Servicios",
            "contact_email": f"{label.lower().replace(' ', '.')}@example.mx",
        }
        self.tables["vendors"].append(vendor)
        return vendor

    def add_employee(self, label: str, *, clabe: str | None = None) -> dict[str, object]:
        self._employee_sequence += 1
        employee = {
            "emp_id": f"EMP:{self._employee_sequence:04d}",
            "name": label,
            "role": "Compras",
            "bank_clabe": clabe or f"{500000 + self._employee_sequence:018d}",
            "hire_date": "2021-03-01",
        }
        self.tables["employees"].append(employee)
        return employee

    def add_invoice(self, vendor: dict[str, object], total: Decimal, date: str, *, status: str = "vigente", metodo_pago: str = "PUE", description: str = "Servicios profesionales") -> dict[str, object]:
        self._invoice_sequence += 1
        subtotal = _money(total / Decimal("1.16"))
        invoice = {
            "uuid": f"INV-{self.seed:05d}-{self._invoice_sequence:04d}",
            "issuer_rfc": vendor["rfc"],
            "receiver_rfc": COMPANY_RFC,
            "issue_date": date,
            "subtotal": subtotal,
            "iva": _money(total - subtotal),
            "total": total,
            "concepto_text": description,
            "uso_cfdi": "G03",
            "forma_pago": "03",
            "metodo_pago": metodo_pago,
            "status": status,
        }
        self.tables["invoices"].append(invoice)
        return invoice

    def add_ledger(self, invoice: dict[str, object], *, credit: Decimal, debit: Decimal = Decimal("0"), account_name: str = "Ingresos por servicios") -> dict[str, object]:
        self._ledger_sequence += 1
        entry = {
            "entry_id": self._ledger_sequence,
            "date": invoice["issue_date"],
            "account_code": "4000" if credit else "5000",
            "account_name": account_name,
            "debit": debit,
            "credit": credit,
            "description": f"Registro {invoice['uuid']}",
            "invoice_uuid": invoice["uuid"],
            "cost_center": "CC-100",
            "approver": "A. Auditor",
        }
        self.tables["ledger"].append(entry)
        return entry

    def add_transaction(self, from_clabe: str, to_clabe: str, amount: Decimal, date: str, reference: str) -> dict[str, object]:
        self._txn_sequence += 1
        transaction = {
            "txn_id": f"BNK-{self.seed:05d}-{self._txn_sequence:04d}",
            "date": date,
            "from_clabe": from_clabe,
            "to_clabe": to_clabe,
            "amount": amount,
            "reference": reference,
            "channel": "SPEI",
        }
        self.tables["bank_txns"].append(transaction)
        return transaction

    def add_po(self, vendor: dict[str, object], amount: Decimal, date: str, requester: str, approver: str, description: str) -> dict[str, object]:
        self._po_sequence += 1
        purchase_order = {
            "po_id": f"PO-{self.seed:05d}-{self._po_sequence:04d}",
            "vendor_rfc": vendor["rfc"],
            "date": date,
            "amount": amount,
            "requester": requester,
            "approver": approver,
            "description": description,
        }
        self.tables["purchase_orders"].append(purchase_order)
        return purchase_order

    def add_contract(self, vendor: dict[str, object], value: Decimal, start_date: str, scope: str) -> dict[str, object]:
        self._contract_sequence += 1
        contract = {
            "contract_id": f"CTR-{self.seed:05d}-{self._contract_sequence:04d}",
            "vendor_rfc": vendor["rfc"],
            "start_date": start_date,
            "value": value,
            "scope_text": scope,
        }
        self.tables["contracts"].append(contract)
        return contract

    def add_efos(self, vendor: dict[str, object], status: str) -> dict[str, object]:
        entry = {"rfc": vendor["rfc"], "legal_name": vendor["legal_name"], "status": status, "publication_date": "2025-12-11"}
        self.tables["efos_list"].append(entry)
        return entry

    def plant_phantom_vendor(self, index: int, difficulty: str) -> None:
        vendor = self.add_vendor(f"Phantom {index}", registered_date="2025-12-01")
        first = self.add_invoice(vendor, _money(92800 + index * 11600), "2026-02-15")
        second = self.add_invoice(vendor, _money(46400 + index * 5800), "2026-02-22")
        self.add_transaction(COMPANY_CLABE, str(vendor["bank_clabe"]), _money(first["total"]), "2026-03-01", f"Pago {first['uuid']}")
        self.add_efos(vendor, "definitivo")
        self.schemes.append({"scheme_id": f"S{len(self.schemes) + 1}_phantom_vendor_{index}", "type": "phantom_vendor", "entities": [f"RFC:{vendor['rfc']}", f"RFC:{COMPANY_RFC}"], "supporting_invoices": [first["uuid"], second["uuid"]], "supporting_txns": [], "peso_amount": _money(first["total"] + second["total"]), "difficulty": difficulty})

    def plant_kickback(self, index: int, difficulty: str) -> None:
        vendor = self.add_vendor(f"Kickback {index}")
        employee = self.add_employee(f"Empleado Vinculado {index}")
        invoice = self.add_invoice(vendor, Decimal("116000.00"), "2026-03-04")
        self.add_po(vendor, Decimal("116000.00"), "2026-03-01", "R. Solicitante", "A. Compras", "Servicio especializado")
        payment = self.add_transaction(COMPANY_CLABE, str(vendor["bank_clabe"]), Decimal("116000.00"), "2026-03-12", f"Pago {invoice['uuid']}")
        kickback = self.add_transaction(str(vendor["bank_clabe"]), str(employee["bank_clabe"]), Decimal("23200.00"), "2026-03-14", "Honorarios personales")
        self.schemes.append({"scheme_id": f"S{len(self.schemes) + 1}_kickback_{index}", "type": "kickback", "entities": [f"RFC:{vendor['rfc']}", employee["emp_id"]], "supporting_invoices": [invoice["uuid"]], "supporting_txns": [payment["txn_id"], kickback["txn_id"]], "peso_amount": Decimal("23200.00"), "difficulty": difficulty})

    def plant_round_tripping(self, index: int, difficulty: str) -> None:
        first = self.add_vendor(f"Cycle A {index}")
        second = self.add_vendor(f"Cycle B {index}")
        third = self.add_vendor(f"Cycle C {index}")
        amount = Decimal("50000.00")
        txns = [
            self.add_transaction(str(first["bank_clabe"]), str(second["bank_clabe"]), amount, "2026-04-01", "Intercompany service"),
            self.add_transaction(str(second["bank_clabe"]), str(third["bank_clabe"]), amount, "2026-04-02", "Intercompany service"),
            self.add_transaction(str(third["bank_clabe"]), str(first["bank_clabe"]), amount, "2026-04-03", "Intercompany service"),
        ]
        self.schemes.append({"scheme_id": f"S{len(self.schemes) + 1}_round_tripping_{index}", "type": "round_tripping", "entities": [f"RFC:{first['rfc']}", f"RFC:{second['rfc']}", f"RFC:{third['rfc']}"], "supporting_invoices": [], "supporting_txns": [txn["txn_id"] for txn in txns], "peso_amount": amount * 3, "difficulty": difficulty})

    def plant_threshold_splitting(self, index: int, difficulty: str) -> None:
        vendor = self.add_vendor(f"Split {index}")
        invoice = self.add_invoice(vendor, Decimal("29700.00"), "2026-05-03", description="Servicios divididos")
        orders = [self.add_po(vendor, Decimal("9900.00"), f"2026-05-0{day}", "M. Solicitante", "A. Nivel Uno", "Alcance relacionado") for day in (1, 3, 5)]
        self.add_po(vendor, Decimal("11000.00"), "2026-05-10", "M. Solicitante", "B. Nivel Dos", "Referencia de aprobacion")
        self.schemes.append({"scheme_id": f"S{len(self.schemes) + 1}_threshold_splitting_{index}", "type": "threshold_splitting", "entities": [f"RFC:{vendor['rfc']}"], "supporting_invoices": [invoice["uuid"]], "supporting_txns": [], "peso_amount": sum((order["amount"] for order in orders), Decimal("0")), "difficulty": difficulty})

    def plant_revenue_inflation(self, index: int, difficulty: str) -> None:
        vendor = self.add_vendor(f"Revenue {index}")
        invoice = self.add_invoice(vendor, Decimal("116000.00"), "2026-06-10", status="cancelado", description="Ingreso cancelado")
        self.add_ledger(invoice, credit=Decimal("116000.00"), account_name="Ingresos por servicios")
        self.schemes.append({"scheme_id": f"S{len(self.schemes) + 1}_revenue_inflation_{index}", "type": "revenue_inflation", "entities": [f"RFC:{vendor['rfc']}", f"RFC:{COMPANY_RFC}"], "supporting_invoices": [invoice["uuid"]], "supporting_txns": [], "peso_amount": invoice["total"], "difficulty": difficulty})

    def add_decoys(self, count: int) -> None:
        if count <= 0:
            return
        vendor = self.add_vendor("Legitimate Framework", registered_date="2025-12-01")
        first = self.add_invoice(vendor, Decimal("58000.00"), "2026-07-01")
        second = self.add_invoice(vendor, Decimal("58000.00"), "2026-07-15")
        contract = self.add_contract(vendor, Decimal("696000.00"), "2026-01-01", "Contrato marco para servicios mensuales recurrentes")
        self.add_po(vendor, Decimal("58000.00"), "2026-07-01", "T. Responsable", "A. Compras", "Servicio mensual documentado")
        self.add_po(vendor, Decimal("58000.00"), "2026-07-15", "T. Responsable", "A. Compras", "Servicio mensual documentado")
        self.add_efos(vendor, "presunto")
        self.decoys.append({"entity": f"RFC:{vendor['rfc']}", "signal": "efos_vendor_with_company_invoices", "why_innocent": f"{contract['contract_id']} y las POs asociadas documentan el servicio y cubren las facturas.", "invoices": [first["uuid"], second["uuid"]]})
        if count >= 2:
            split_vendor = self.add_vendor("Legitimate Split")
            orders = [self.add_po(split_vendor, Decimal("9900.00"), f"2026-08-0{day}", "L. Responsable", "A. Nivel Uno", "Alcances separados") for day in (1, 3, 5)]
            self.add_po(split_vendor, Decimal("11000.00"), "2026-08-10", "L. Responsable", "B. Nivel Dos", "Compra distinta")
            contract = self.add_contract(split_vendor, Decimal("120000.00"), "2026-08-01", "Contrato marco que cubre alcances separados")
            self.decoys.append({"entity": f"RFC:{split_vendor['rfc']}", "signal": "repeated_sub_threshold_purchase_orders", "why_innocent": f"{contract['contract_id']} establece los alcances legítimos de {', '.join(order['po_id'] for order in orders)}.", "invoices": []})
        if count >= 3:
            first_vendor = self.add_vendor("Refund A")
            second_vendor = self.add_vendor("Refund B")
            third_vendor = self.add_vendor("Refund C")
            txns = [
                self.add_transaction(str(first_vendor["bank_clabe"]), str(second_vendor["bank_clabe"]), Decimal("10000.00"), "2026-09-01", "Reembolso documentado"),
                self.add_transaction(str(second_vendor["bank_clabe"]), str(third_vendor["bank_clabe"]), Decimal("10000.00"), "2026-09-02", "Reembolso documentado"),
                self.add_transaction(str(third_vendor["bank_clabe"]), str(first_vendor["bank_clabe"]), Decimal("10000.00"), "2026-09-03", "Reembolso documentado"),
            ]
            self.decoys.append({"entity": f"RFC:{first_vendor['rfc']}", "signal": "directed_bank_cycle", "why_innocent": "Las referencias de las transferencias indican un reembolso documentado.", "invoices": [txn["txn_id"] for txn in txns]})
        for extra in range(4, min(count, 10) + 1):
            vendor = self.add_vendor(f"Legitimate {extra}")
            invoice = self.add_invoice(vendor, Decimal("46400.00"), f"2026-10-{extra:02d}", metodo_pago="PPD")
            self.add_contract(vendor, Decimal("556800.00"), "2026-01-01", "Servicio regular documentado")
            self.decoys.append({"entity": f"RFC:{vendor['rfc']}", "signal": "new_vendor_or_ppd", "why_innocent": "Proveedor nuevo con contrato válido y CFDI PPD todavía no pagado.", "invoices": [invoice["uuid"]]})


def _csv_text(columns: Sequence[str], rows: Iterable[dict[str, object]]) -> bytes:
    target = io.StringIO(newline="")
    writer = csv.DictWriter(target, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: _as_string(row.get(column, "")) for column in columns})
    return target.getvalue().encode("utf-8")


def _write_csv_zip(path: Path, tables: dict[str, list[dict[str, object]]]) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for table in TABLE_COLUMNS:
            entry = zipfile.ZipInfo(f"{table}.csv", date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, _csv_text(TABLE_COLUMNS[table], tables[table]))


def _write_sqlite(path: Path, tables: dict[str, list[dict[str, object]]]) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(SQL_SCHEMA)
        for table, columns in TABLE_COLUMNS.items():
            placeholders = ", ".join("?" for _ in columns)
            query = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
            connection.executemany(query, [tuple(_as_string(row[column]) for column in columns) for row in tables[table]])
        connection.commit()
    finally:
        connection.close()


def generate_estate(
    output_directory: str | Path,
    seed: int,
    scheme_types: Sequence[str] = SCHEME_TYPES,
    *,
    instances_per_scheme: int = 1,
    decoy_count: int = 3,
    difficulty: str = "medium",
    zero_fraud: bool = False,
) -> GeneratedEstate:
    if not set(scheme_types).issubset(SCHEME_TYPES):
        raise ValueError("Se solicitó un esquema no permitido.")
    if not 0 <= decoy_count <= 10:
        raise ValueError("decoy_count debe estar entre 0 y 10.")
    if instances_per_scheme < 1:
        raise ValueError("instances_per_scheme debe ser al menos 1.")
    if difficulty not in {"easy", "medium", "hard"}:
        raise ValueError("difficulty debe ser easy, medium o hard.")
    builder = EstateBuilder(seed)
    builder.add_employee("Empleado Base")
    if not zero_fraud:
        for scheme_type in scheme_types:
            procedure = getattr(builder, f"plant_{scheme_type}")
            for index in range(1, instances_per_scheme + 1):
                procedure(index, difficulty)
    builder.add_decoys(decoy_count)
    destination = Path(output_directory)
    destination.mkdir(parents=True, exist_ok=True)
    csv_zip = destination / "estate_csv.zip"
    sqlite_db = destination / "estate.db"
    answer_key = destination / "answer_key.json"
    manifest = destination / "estate_manifest.json"
    _write_csv_zip(csv_zip, builder.tables)
    _write_sqlite(sqlite_db, builder.tables)
    answer_key.write_text(json.dumps({"seed": seed, "schemes": builder.schemes, "decoys": builder.decoys, "company_rfc": COMPANY_RFC}, indent=2, default=_as_string), encoding="utf-8")
    manifest.write_text(json.dumps({"seed": seed, "difficulty": difficulty, "zero_fraud": zero_fraud, "scheme_types": list(scheme_types), "instances_per_scheme": instances_per_scheme, "decoy_count": decoy_count}, indent=2), encoding="utf-8")
    return GeneratedEstate(csv_zip=csv_zip, sqlite_db=sqlite_db, answer_key=answer_key, manifest=manifest)