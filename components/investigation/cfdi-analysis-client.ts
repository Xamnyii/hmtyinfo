import type {
  BillingRelationship,
  CfdiAnalysisFile,
  CfdiAnalysisMetrics,
  CfdiAnalysisResult,
  CfdiAnalysisSummary,
  CfdiConcept,
  CfdiEntity,
  CfdiEvidence,
  CfdiParty,
  CfdiSignal,
  ParsedCfdi,
  SignalSeverity,
} from "./cfdi-types";

type JsonRecord = Record<string, unknown>;

export class CfdiAnalysisClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CfdiAnalysisClientError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (!result) throw new CfdiAnalysisClientError(`La respuesta del analizador no contiene ${label}.`);
  return result;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function requiredNumber(value: unknown, label: string): number {
  const result = optionalNumber(value);
  if (typeof result !== "number") throw new CfdiAnalysisClientError(`La respuesta del analizador no contiene ${label}.`);
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

function normalizeParty(value: unknown): CfdiParty {
  const source = isRecord(value) ? value : {};
  return {
    rfc: optionalString(source.rfc),
    name: optionalString(source.name),
    taxRegime: optionalString(source.taxRegime),
    fiscalAddress: optionalString(source.fiscalAddress),
    cfdiUse: optionalString(source.cfdiUse),
  };
}

function normalizeConcept(value: JsonRecord): CfdiConcept {
  return {
    productServiceKey: optionalString(value.productServiceKey),
    identificationNumber: optionalString(value.identificationNumber),
    quantity: optionalNumber(value.quantity),
    unitKey: optionalString(value.unitKey),
    unit: optionalString(value.unit),
    description: optionalString(value.description),
    unitValue: optionalNumber(value.unitValue),
    amount: optionalNumber(value.amount),
    discount: optionalNumber(value.discount),
  };
}

function normalizeInvoice(value: unknown): ParsedCfdi {
  if (!isRecord(value)) throw new CfdiAnalysisClientError("La respuesta del analizador contiene una factura inválida.");

  return {
    invoiceId: requiredString(value.invoiceId, "un identificador de factura"),
    sourceFileIndex: requiredNumber(value.sourceFileIndex, "el índice de archivo"),
    sourceFileName: optionalString(value.sourceFileName),
    uuid: optionalString(value.uuid),
    version: optionalString(value.version),
    series: optionalString(value.series),
    folio: optionalString(value.folio),
    date: optionalString(value.date),
    stampedAt: optionalString(value.stampedAt),
    subtotal: optionalNumber(value.subtotal),
    total: optionalNumber(value.total),
    currency: optionalString(value.currency),
    paymentMethod: optionalString(value.paymentMethod),
    paymentForm: optionalString(value.paymentForm),
    voucherType: optionalString(value.voucherType),
    expeditionPlace: optionalString(value.expeditionPlace),
    issuer: normalizeParty(value.issuer),
    receiver: normalizeParty(value.receiver),
    concepts: records(value.concepts).map(normalizeConcept),
  };
}

function normalizeFile(value: JsonRecord): CfdiAnalysisFile {
  const status = optionalString(value.status);
  if (status !== "parsed" && status !== "error") {
    throw new CfdiAnalysisClientError("La respuesta del analizador contiene un estado de archivo inválido.");
  }

  return {
    fileIndex: requiredNumber(value.fileIndex, "el índice de archivo"),
    name: requiredString(value.name, "el nombre de archivo"),
    size: requiredNumber(value.size, "el tamaño del archivo"),
    status,
    parsed: status === "parsed" ? normalizeInvoice(value.parsed) : undefined,
    error: status === "error" ? optionalString(value.error) || "No fue posible analizar este XML." : undefined,
  };
}

function normalizeEntities(value: unknown): CfdiEntity[] {
  return records(value).map((entity) => ({
    entityId: requiredString(entity.entityId, "un identificador de entidad"),
    rfc: requiredString(entity.rfc, "un RFC de entidad"),
    name: optionalString(entity.name),
    roles: stringArray(entity.roles).flatMap((role) => (role === "issuer" || role === "receiver" ? [role] : [])),
  }));
}

function normalizeRelationships(value: unknown): BillingRelationship[] {
  return records(value).map((relationship) => ({
    relationshipId: requiredString(relationship.relationshipId, "un identificador de relación"),
    issuerEntityId: requiredString(relationship.issuerEntityId, "el emisor de una relación"),
    receiverEntityId: requiredString(relationship.receiverEntityId, "el receptor de una relación"),
    invoiceIds: stringArray(relationship.invoiceIds),
    invoiceCount: requiredNumber(relationship.invoiceCount, "el número de facturas de una relación"),
    totalInvoiced: requiredNumber(relationship.totalInvoiced, "el total de una relación"),
    currency: optionalString(relationship.currency),
  }));
}

function normalizeEvidence(value: unknown): CfdiEvidence[] {
  return records(value).map((evidence) => ({
    evidenceId: requiredString(evidence.evidenceId, "un identificador de evidencia"),
    evidenceType: "invoice",
    source: "Python CFDI analyzer",
    sourceFile: requiredString(evidence.sourceFile, "la fuente de evidencia"),
    invoiceId: requiredString(evidence.invoiceId, "la factura de evidencia"),
    fact: requiredString(evidence.fact, "un hecho de evidencia"),
  }));
}

function normalizeSeverity(value: unknown): SignalSeverity {
  if (value === "INFO" || value === "LOW" || value === "MEDIUM" || value === "HIGH") return value;
  throw new CfdiAnalysisClientError("La respuesta del analizador contiene una severidad inválida.");
}

function normalizeSignals(value: unknown): CfdiSignal[] {
  return records(value).map((signal) => ({
    signalId: requiredString(signal.signalId, "un identificador de señal"),
    code: requiredString(signal.code, "un código de señal"),
    title: requiredString(signal.title, "un título de señal"),
    severity: normalizeSeverity(signal.severity),
    description: requiredString(signal.description, "una descripción de señal"),
    entityIds: stringArray(signal.entityIds),
    invoiceIds: stringArray(signal.invoiceIds),
    evidenceIds: stringArray(signal.evidenceIds),
    confidence: requiredNumber(signal.confidence, "la confianza de señal"),
    whatItMeans: requiredString(signal.whatItMeans, "la interpretación de señal"),
    whatItDoesNotProve: requiredString(signal.whatItDoesNotProve, "el límite de señal"),
  }));
}

function normalizeMetrics(value: unknown): CfdiAnalysisMetrics {
  if (!isRecord(value) || !isRecord(value.totalAmountByCurrency)) {
    throw new CfdiAnalysisClientError("La respuesta del analizador no contiene métricas válidas.");
  }
  const totalAmountByCurrency = Object.fromEntries(
    Object.entries(value.totalAmountByCurrency).flatMap(([currency, amount]) => {
      const normalizedAmount = optionalNumber(amount);
      return typeof normalizedAmount === "number" ? [[currency, normalizedAmount]] : [];
    }),
  );

  return {
    totalFiles: requiredNumber(value.totalFiles, "el total de archivos"),
    validFiles: requiredNumber(value.validFiles, "los archivos válidos"),
    invalidFiles: requiredNumber(value.invalidFiles, "los archivos inválidos"),
    invoiceCount: requiredNumber(value.invoiceCount, "el total de facturas"),
    totalAmountByCurrency,
    uniqueEntities: requiredNumber(value.uniqueEntities, "las entidades únicas"),
    uniqueIssuers: requiredNumber(value.uniqueIssuers, "los emisores únicos"),
    uniqueReceivers: requiredNumber(value.uniqueReceivers, "los receptores únicos"),
    relationshipCount: requiredNumber(value.relationshipCount, "las relaciones"),
    signalCount: requiredNumber(value.signalCount, "las señales"),
  };
}

function normalizeSummary(value: unknown): CfdiAnalysisSummary {
  if (!isRecord(value)) throw new CfdiAnalysisClientError("La respuesta del analizador no contiene un resumen válido.");
  const highestSeverity = optionalString(value.highestSeverity);
  return {
    invoiceCount: requiredNumber(value.invoiceCount, "el total de facturas del resumen"),
    entityCount: requiredNumber(value.entityCount, "el total de entidades del resumen"),
    signalCount: requiredNumber(value.signalCount, "el total de señales del resumen"),
    highestSeverity: highestSeverity ? normalizeSeverity(highestSeverity) : undefined,
  };
}

function getErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return optionalString(value.error) || optionalString(value.detail);
}

function normalizeAnalysisResult(value: unknown): CfdiAnalysisResult {
  if (!isRecord(value)) throw new CfdiAnalysisClientError("El servicio de análisis devolvió una respuesta inválida.");
  const files = records(value.files).map(normalizeFile);
  if (files.length === 0) throw new CfdiAnalysisClientError("El servicio de análisis no devolvió archivos procesados.");

  return {
    analysisSource: "python",
    files,
    invoices: records(value.invoices).map(normalizeInvoice),
    entities: normalizeEntities(value.entities),
    relationships: normalizeRelationships(value.relationships),
    evidence: normalizeEvidence(value.evidence),
    signals: normalizeSignals(value.signals),
    metrics: normalizeMetrics(value.metrics),
    summary: normalizeSummary(value.summary),
  };
}

export async function analyzeCfdiFiles(files: File[]): Promise<CfdiAnalysisResult> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file, file.name);

  let response: Response;
  try {
    response = await fetch("/api/cfdi/analyze", { method: "POST", body: formData });
  } catch {
    throw new CfdiAnalysisClientError("El servicio de análisis no está disponible.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CfdiAnalysisClientError(getErrorMessage(payload) || "RamRod no pudo analizar los XML.");
  }
  if (!isRecord(payload) || payload.ok !== true) {
    throw new CfdiAnalysisClientError(getErrorMessage(payload) || "El servicio de análisis devolvió una respuesta inválida.");
  }

  return normalizeAnalysisResult(payload.result);
}