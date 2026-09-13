import type { CfdiConcept, CfdiParty, ParsedCfdi } from "./cfdi-types";

export class CfdiXmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CfdiXmlParseError";
  }
}

function getAttribute(element: Element | undefined, names: readonly string[]): string | undefined {
  if (!element) return undefined;

  for (const name of names) {
    const value = element.getAttribute(name)?.trim();
    if (value) return value;
  }

  return undefined;
}

function getOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasLocalName(element: Element, localName: string): boolean {
  return element.localName.toLowerCase() === localName.toLowerCase();
}

function findElement(root: Element, localName: string): Element | undefined {
  if (hasLocalName(root, localName)) return root;

  return Array.from(root.getElementsByTagName("*")).find((element) => hasLocalName(element, localName));
}

function findElements(root: Element, localName: string): Element[] {
  return [root, ...Array.from(root.getElementsByTagName("*"))].filter((element) => hasLocalName(element, localName));
}

function parseParty(element: Element | undefined, receiver = false): CfdiParty {
  return {
    rfc: getAttribute(element, ["Rfc", "RFC", "rfc"]),
    name: getAttribute(element, ["Nombre", "nombre"]),
    taxRegime: getAttribute(element, receiver ? ["RegimenFiscalReceptor", "regimenFiscalReceptor"] : ["RegimenFiscal", "regimenFiscal"]),
    fiscalAddress: receiver ? getAttribute(element, ["DomicilioFiscalReceptor", "domicilioFiscalReceptor"]) : undefined,
    cfdiUse: receiver ? getAttribute(element, ["UsoCFDI", "usoCFDI"]) : undefined,
  };
}

function parseConcepts(root: Element): CfdiConcept[] {
  return findElements(root, "Concepto").map((concept) => ({
    description: getAttribute(concept, ["Descripcion", "descripción", "descripcion"]),
    quantity: getOptionalNumber(getAttribute(concept, ["Cantidad", "cantidad"])),
    unitValue: getOptionalNumber(getAttribute(concept, ["ValorUnitario", "valorUnitario"])),
    amount: getOptionalNumber(getAttribute(concept, ["Importe", "importe"])),
    productServiceKey: getAttribute(concept, ["ClaveProdServ", "claveProdServ"]),
  }));
}

function hasParserError(document: Document): boolean {
  return findElements(document.documentElement, "parsererror").length > 0;
}

// The UI consumes ParsedCfdi only, allowing this browser parser to be replaced by a Python service later.
export async function parseCfdiXml(file: File): Promise<ParsedCfdi> {
  const xml = await file.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");

  if (hasParserError(document)) {
    throw new CfdiXmlParseError("No se pudo interpretar el XML.");
  }

  const comprobante = findElement(document.documentElement, "Comprobante");
  if (!comprobante) {
    throw new CfdiXmlParseError("El archivo no contiene un comprobante CFDI.");
  }

  const issuer = findElement(comprobante, "Emisor");
  const receiver = findElement(comprobante, "Receptor");
  const stamp = findElement(comprobante, "TimbreFiscalDigital");

  return {
    uuid: getAttribute(stamp, ["UUID", "Uuid", "uuid"]),
    version: getAttribute(comprobante, ["Version", "version"]),
    series: getAttribute(comprobante, ["Serie", "serie"]),
    folio: getAttribute(comprobante, ["Folio", "folio"]),
    date: getAttribute(comprobante, ["Fecha", "fecha"]),
    stampedAt: getAttribute(stamp, ["FechaTimbrado", "fechaTimbrado"]),
    subtotal: getOptionalNumber(getAttribute(comprobante, ["SubTotal", "Subtotal", "subTotal"])),
    total: getOptionalNumber(getAttribute(comprobante, ["Total", "total"])),
    currency: getAttribute(comprobante, ["Moneda", "moneda"]),
    voucherType: getAttribute(comprobante, ["TipoDeComprobante", "tipoDeComprobante"]),
    paymentMethod: getAttribute(comprobante, ["MetodoPago", "metodoPago"]),
    paymentForm: getAttribute(comprobante, ["FormaPago", "formaPago"]),
    expeditionPlace: getAttribute(comprobante, ["LugarExpedicion", "lugarExpedicion"]),
    issuer: parseParty(issuer),
    receiver: parseParty(receiver, true),
    concepts: parseConcepts(comprobante),
  };
}