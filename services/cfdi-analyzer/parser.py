from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Iterable
from xml.etree.ElementTree import Element, ParseError

from defusedxml import ElementTree as DefusedElementTree
from defusedxml.common import DefusedXmlException

from models import CfdiConcept, CfdiInvoice, CfdiParty


class CfdiParseError(ValueError):
    """A controlled error caused by untrusted or invalid CFDI input."""


def local_name(value: str) -> str:
    return value.rsplit("}", maxsplit=1)[-1].rsplit(":", maxsplit=1)[-1]


def find_first(root: Element, element_name: str) -> Element | None:
    expected = element_name.casefold()
    return next(
        (
            element
            for element in root.iter()
            if isinstance(element.tag, str) and local_name(element.tag).casefold() == expected
        ),
        None,
    )


def find_all(root: Element, element_name: str) -> Iterable[Element]:
    expected = element_name.casefold()
    return (
        element
        for element in root.iter()
        if isinstance(element.tag, str) and local_name(element.tag).casefold() == expected
    )


def attribute(element: Element | None, *names: str) -> str | None:
    if element is None:
        return None

    requested_names = {name.casefold() for name in names}
    for attribute_name, value in element.attrib.items():
        if local_name(attribute_name).casefold() in requested_names:
            normalized = value.strip()
            return normalized or None

    return None


def decimal_value(value: str | None) -> Decimal | None:
    if value is None:
        return None

    try:
        decimal = Decimal(value)
    except (InvalidOperation, ValueError):
        return None

    return decimal if decimal.is_finite() else None


def normalized_upper(value: str | None) -> str | None:
    return value.strip().upper() if value and value.strip() else None


def parse_party(element: Element | None, receiver: bool = False) -> CfdiParty:
    tax_regime_names = ("RegimenFiscalReceptor", "RegimenFiscal") if receiver else ("RegimenFiscal",)
    return CfdiParty(
        rfc=normalized_upper(attribute(element, "Rfc")),
        name=attribute(element, "Nombre"),
        tax_regime=attribute(element, *tax_regime_names),
        fiscal_address=attribute(element, "DomicilioFiscalReceptor") if receiver else None,
        cfdi_use=attribute(element, "UsoCFDI") if receiver else None,
    )


def parse_concepts(comprobante: Element) -> list[CfdiConcept]:
    return [
        CfdiConcept(
            product_service_key=attribute(concept, "ClaveProdServ"),
            identification_number=attribute(concept, "NoIdentificacion"),
            quantity=decimal_value(attribute(concept, "Cantidad")),
            unit_key=attribute(concept, "ClaveUnidad"),
            unit=attribute(concept, "Unidad"),
            description=attribute(concept, "Descripcion"),
            unit_value=decimal_value(attribute(concept, "ValorUnitario")),
            amount=decimal_value(attribute(concept, "Importe")),
            discount=decimal_value(attribute(concept, "Descuento")),
        )
        for concept in find_all(comprobante, "Concepto")
    ]


def parse_cfdi(xml_content: bytes, source_file_index: int, source_file_name: str) -> CfdiInvoice:
    if not xml_content:
        raise CfdiParseError("El archivo XML está vacío.")

    uppercase_content = xml_content.upper()
    if b"<!DOCTYPE" in uppercase_content or b"<!ENTITY" in uppercase_content:
        raise CfdiParseError("El XML contiene una declaración no permitida.")

    try:
        root = DefusedElementTree.fromstring(xml_content)
    except (DefusedXmlException, ParseError, ValueError) as error:
        raise CfdiParseError("No se pudo interpretar el XML.") from error

    comprobante = find_first(root, "Comprobante")
    if comprobante is None:
        raise CfdiParseError("El archivo no contiene un comprobante CFDI.")

    issuer = find_first(comprobante, "Emisor")
    receiver = find_first(comprobante, "Receptor")
    stamp = find_first(comprobante, "TimbreFiscalDigital")

    return CfdiInvoice(
        invoice_id=f"INV-{source_file_index + 1:03d}",
        source_file_index=source_file_index,
        source_file_name=source_file_name,
        uuid=normalized_upper(attribute(stamp, "UUID")),
        version=attribute(comprobante, "Version"),
        series=attribute(comprobante, "Serie"),
        folio=attribute(comprobante, "Folio"),
        date=attribute(comprobante, "Fecha"),
        stamped_at=attribute(stamp, "FechaTimbrado"),
        subtotal=decimal_value(attribute(comprobante, "SubTotal", "Subtotal")),
        total=decimal_value(attribute(comprobante, "Total")),
        currency=normalized_upper(attribute(comprobante, "Moneda")),
        voucher_type=attribute(comprobante, "TipoDeComprobante"),
        payment_method=attribute(comprobante, "MetodoPago"),
        payment_form=attribute(comprobante, "FormaPago"),
        expedition_place=attribute(comprobante, "LugarExpedicion"),
        issuer=parse_party(issuer),
        receiver=parse_party(receiver, receiver=True),
        concepts=parse_concepts(comprobante),
    )