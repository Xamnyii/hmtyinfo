import type {
  BillingRelationship,
  CfdiAnalysisResult,
  CfdiEntity,
  CfdiEvidence,
  CfdiParty,
  CfdiSignal,
  ParsedCfdi,
  SignalSeverity,
} from "./cfdi-types";

type ParsedFileResult = {
  fileIndex: number;
  name: string;
  size: number;
  status: "parsed" | "error";
  parsed?: ParsedCfdi;
  error?: string;
};

function localName(value: string): string {
  return value.split(":").pop()?.split("}").pop() ?? value;
}

function findFirst(root: Element, elementName: string): Element | undefined {
  const expected = elementName.toLowerCase();
  return Array.from(root.getElementsByTagName("*")).find((element) => localName(element.tagName).toLowerCase() === expected);
}

function findAll(root: Element, elementName: string): Element[] {
  const expected = elementName.toLowerCase();
  return Array.from(root.getElementsByTagName("*")).filter((element) => localName(element.tagName).toLowerCase() === expected);
}

function attribute(element: Element | undefined, ...names: string[]): string | undefined {
  if (!element) return undefined;
  const requested = new Set(names.map((name) => name.toLowerCase()));
  for (const attr of Array.from(element.attributes)) {
    if (requested.has(localName(attr.name).toLowerCase())) {
      const normalized = attr.value.trim();
      return normalized || undefined;
    }
  }
  return undefined;
}

function upper(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim().toUpperCase() : undefined;
}

function numberValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseParty(element: Element | undefined, receiver = false): CfdiParty {
  return {
    rfc: upper(attribute(element, "Rfc")),
    name: attribute(element, "Nombre"),
    taxRegime: receiver ? attribute(element, "RegimenFiscalReceptor", "RegimenFiscal") : attribute(element, "RegimenFiscal"),
    fiscalAddress: receiver ? attribute(element, "DomicilioFiscalReceptor") : undefined,
    cfdiUse: receiver ? attribute(element, "UsoCFDI") : undefined,
  };
}

function parseCfdiXml(text: string, fileIndex: number, fileName: string): ParsedCfdi {
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error("El archivo XML está vacío.");
  if (/<!DOCTYPE|<!ENTITY/i.test(normalizedText)) throw new Error("El XML contiene una declaración no permitida.");

  const document = new DOMParser().parseFromString(normalizedText, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) throw new Error("No se pudo interpretar el XML.");

  const comprobante = findFirst(document.documentElement, "Comprobante");
  if (!comprobante) throw new Error("El archivo no contiene un comprobante CFDI.");

  const issuer = findFirst(comprobante, "Emisor");
  const receiver = findFirst(comprobante, "Receptor");
  const stamp = findFirst(comprobante, "TimbreFiscalDigital");

  return {
    invoiceId: `INV-${String(fileIndex + 1).padStart(3, "0")}`,
    sourceFileIndex: fileIndex,
    sourceFileName: fileName,
    uuid: upper(attribute(stamp, "UUID")),
    version: attribute(comprobante, "Version"),
    series: attribute(comprobante, "Serie"),
    folio: attribute(comprobante, "Folio"),
    date: attribute(comprobante, "Fecha"),
    stampedAt: attribute(stamp, "FechaTimbrado"),
    subtotal: numberValue(attribute(comprobante, "SubTotal", "Subtotal")),
    total: numberValue(attribute(comprobante, "Total")),
    currency: upper(attribute(comprobante, "Moneda")),
    paymentMethod: attribute(comprobante, "MetodoPago"),
    paymentForm: attribute(comprobante, "FormaPago"),
    voucherType: attribute(comprobante, "TipoDeComprobante"),
    expeditionPlace: attribute(comprobante, "LugarExpedicion"),
    issuer: parseParty(issuer),
    receiver: parseParty(receiver, true),
    concepts: findAll(comprobante, "Concepto").map((concept) => ({
      productServiceKey: attribute(concept, "ClaveProdServ"),
      identificationNumber: attribute(concept, "NoIdentificacion"),
      quantity: numberValue(attribute(concept, "Cantidad")),
      unitKey: attribute(concept, "ClaveUnidad"),
      unit: attribute(concept, "Unidad"),
      description: attribute(concept, "Descripcion"),
      unitValue: numberValue(attribute(concept, "ValorUnitario")),
      amount: numberValue(attribute(concept, "Importe")),
      discount: numberValue(attribute(concept, "Descuento")),
    })),
  };
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function entityIdsForInvoice(invoice: ParsedCfdi, entityIdByRfc: Map<string, string>): string[] {
  return unique([
    invoice.issuer.rfc ? entityIdByRfc.get(invoice.issuer.rfc) : undefined,
    invoice.receiver.rfc ? entityIdByRfc.get(invoice.receiver.rfc) : undefined,
  ].flatMap((value) => value ? [value] : []));
}

function buildEntities(invoices: ParsedCfdi[]): { entities: CfdiEntity[]; entityIdByRfc: Map<string, string> } {
  const entitiesByRfc = new Map<string, CfdiEntity>();
  for (const invoice of invoices) {
    for (const [party, role] of [[invoice.issuer, "issuer"], [invoice.receiver, "receiver"]] as const) {
      if (!party.rfc) continue;
      const current = entitiesByRfc.get(party.rfc);
      if (current) {
        if (party.name && !current.name) current.name = party.name;
        if (!current.roles.includes(role)) current.roles.push(role);
      } else {
        entitiesByRfc.set(party.rfc, {
          entityId: `ENT-${String(entitiesByRfc.size + 1).padStart(3, "0")}`,
          rfc: party.rfc,
          name: party.name,
          roles: [role],
        });
      }
    }
  }
  const entities = Array.from(entitiesByRfc.values());
  return { entities, entityIdByRfc: new Map(entities.map((entity) => [entity.rfc, entity.entityId])) };
}

function amountLabel(amount: number | undefined, currency: string | undefined): string {
  return typeof amount === "number" ? `${amount} ${currency ?? ""}`.trim() : "No disponible";
}

function addSignal(signals: CfdiSignal[], signal: Omit<CfdiSignal, "signalId" | "confidence" | "whatItDoesNotProve"> & { whatItDoesNotProve?: string }) {
  signals.push({
    ...signal,
    signalId: `SIG-${String(signals.length + 1).padStart(3, "0")}`,
    confidence: 1,
    entityIds: unique(signal.entityIds),
    invoiceIds: unique(signal.invoiceIds),
    evidenceIds: unique(signal.evidenceIds),
    whatItDoesNotProve: signal.whatItDoesNotProve ?? "No demuestra por sí sola la existencia de fraude.",
  });
}

function analyzeParsedInvoices(invoices: ParsedCfdi[], totalFiles: number): Omit<CfdiAnalysisResult, "analysisSource" | "files" | "invoices"> {
  const { entities, entityIdByRfc } = buildEntities(invoices);
  const evidence: CfdiEvidence[] = invoices.map((invoice, index) => ({
    evidenceId: `E-${String(index + 1).padStart(3, "0")}`,
    evidenceType: "invoice",
    source: "Browser CFDI analyzer",
    sourceFile: invoice.sourceFileName ?? `archivo-${index + 1}.xml`,
    invoiceId: invoice.invoiceId ?? `INV-${String(index + 1).padStart(3, "0")}`,
    fact: `CFDI ${invoice.invoiceId}: ${invoice.issuer.rfc ?? "emisor no disponible"} facturó a ${invoice.receiver.rfc ?? "receptor no disponible"} por ${amountLabel(invoice.total, invoice.currency)}.`,
  }));
  const evidenceByInvoice = new Map(evidence.map((item) => [item.invoiceId, item.evidenceId]));

  const relationshipMap = new Map<string, BillingRelationship>();
  for (const invoice of invoices) {
    if (!invoice.issuer.rfc || !invoice.receiver.rfc || !invoice.invoiceId) continue;
    const key = `${invoice.issuer.rfc}|${invoice.receiver.rfc}|${invoice.currency ?? ""}`;
    const current = relationshipMap.get(key);
    if (current) {
      current.invoiceIds.push(invoice.invoiceId);
      current.invoiceCount += 1;
      current.totalInvoiced += invoice.total ?? 0;
    } else {
      relationshipMap.set(key, {
        relationshipId: `REL-${String(relationshipMap.size + 1).padStart(3, "0")}`,
        issuerEntityId: entityIdByRfc.get(invoice.issuer.rfc) ?? "",
        receiverEntityId: entityIdByRfc.get(invoice.receiver.rfc) ?? "",
        invoiceIds: [invoice.invoiceId],
        invoiceCount: 1,
        totalInvoiced: invoice.total ?? 0,
        currency: invoice.currency,
      });
    }
  }
  const relationships = Array.from(relationshipMap.values());
  const signals: CfdiSignal[] = [];

  const byUuid = new Map<string, ParsedCfdi[]>();
  for (const invoice of invoices) {
    if (!invoice.uuid) {
      addSignal(signals, {
        code: "MISSING_FISCAL_STAMP",
        title: "Timbre fiscal no disponible",
        severity: "INFO",
        description: "No se encontró UUID de TimbreFiscalDigital en el XML.",
        entityIds: entityIdsForInvoice(invoice, entityIdByRfc),
        invoiceIds: invoice.invoiceId ? [invoice.invoiceId] : [],
        evidenceIds: invoice.invoiceId && evidenceByInvoice.get(invoice.invoiceId) ? [evidenceByInvoice.get(invoice.invoiceId) as string] : [],
        whatItMeans: "El conjunto no contiene un UUID fiscal para este comprobante.",
        whatItDoesNotProve: "No determina por sí sola la validez o invalidez del documento.",
      });
    } else {
      byUuid.set(invoice.uuid, [...(byUuid.get(invoice.uuid) ?? []), invoice]);
    }

    if (invoice.issuer.rfc && invoice.receiver.rfc && invoice.issuer.rfc === invoice.receiver.rfc) {
      addSignal(signals, {
        code: "SAME_ISSUER_RECEIVER",
        title: "Emisor y receptor con el mismo RFC",
        severity: "MEDIUM",
        description: `El emisor y receptor del comprobante usan el RFC ${invoice.issuer.rfc}.`,
        entityIds: entityIdsForInvoice(invoice, entityIdByRfc),
        invoiceIds: invoice.invoiceId ? [invoice.invoiceId] : [],
        evidenceIds: invoice.invoiceId && evidenceByInvoice.get(invoice.invoiceId) ? [evidenceByInvoice.get(invoice.invoiceId) as string] : [],
        whatItMeans: "La factura vincula el mismo RFC en ambos roles declarados.",
      });
    }
  }

  for (const [uuid, matches] of byUuid) {
    if (matches.length < 2) continue;
    addSignal(signals, {
      code: "DUPLICATE_UUID",
      title: "UUID fiscal repetido",
      severity: "HIGH",
      description: `El UUID ${uuid} aparece en ${matches.length} archivos analizados.`,
      entityIds: matches.flatMap((invoice) => entityIdsForInvoice(invoice, entityIdByRfc)),
      invoiceIds: matches.flatMap((invoice) => invoice.invoiceId ? [invoice.invoiceId] : []),
      evidenceIds: matches.flatMap((invoice) => invoice.invoiceId && evidenceByInvoice.get(invoice.invoiceId) ? [evidenceByInvoice.get(invoice.invoiceId) as string] : []),
      whatItMeans: "El mismo identificador fiscal fue observado en más de un XML dentro del conjunto analizado.",
    });
  }

  const totals = invoices.reduce<Record<string, number>>((accumulator, invoice) => {
    if (typeof invoice.total !== "number") return accumulator;
    const currency = invoice.currency ?? "UNSPECIFIED";
    accumulator[currency] = (accumulator[currency] ?? 0) + invoice.total;
    return accumulator;
  }, {});
  const severityRank: Record<SignalSeverity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
  const highestSignal = signals.toSorted((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];

  return {
    entities,
    relationships,
    evidence,
    signals,
    metrics: {
      totalFiles,
      validFiles: invoices.length,
      invalidFiles: totalFiles - invoices.length,
      invoiceCount: invoices.length,
      totalAmountByCurrency: totals,
      uniqueEntities: entities.length,
      uniqueIssuers: new Set(invoices.flatMap((invoice) => invoice.issuer.rfc ? [invoice.issuer.rfc] : [])).size,
      uniqueReceivers: new Set(invoices.flatMap((invoice) => invoice.receiver.rfc ? [invoice.receiver.rfc] : [])).size,
      relationshipCount: relationships.length,
      signalCount: signals.length,
    },
    summary: {
      invoiceCount: invoices.length,
      entityCount: entities.length,
      signalCount: signals.length,
      highestSeverity: highestSignal?.severity,
    },
  };
}

export async function analyzeCfdiFilesInBrowser(files: File[]): Promise<CfdiAnalysisResult> {
  const results: ParsedFileResult[] = [];
  const invoices: ParsedCfdi[] = [];

  for (const [index, file] of files.entries()) {
    try {
      const parsed = parseCfdiXml(await file.text(), index, file.name);
      invoices.push(parsed);
      results.push({ fileIndex: index, name: file.name, size: file.size, status: "parsed", parsed });
    } catch (error) {
      results.push({
        fileIndex: index,
        name: file.name,
        size: file.size,
        status: "error",
        error: error instanceof Error ? error.message : "No fue posible analizar este XML.",
      });
    }
  }

  return {
    analysisSource: "browser-fallback",
    files: results,
    invoices,
    ...analyzeParsedInvoices(invoices, files.length),
  };
}
