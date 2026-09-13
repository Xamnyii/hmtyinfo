export type ForensicExhibit = { exhibitId: string; sourceTable: string; recordId: string; note: string };
export type ForensicMoneyTrailStep = { fromEntity: string; toEntity: string; amount: number; date: string; exhibitId: string };
export type ForensicReconciliation = { claimed: number; actual: number; passes: boolean; explanation: string; perTable: Record<string, number> };
export type ForensicFinding = {
  findingId: string;
  schemeType: string;
  entities: string[];
  narrative: string;
  ruleBroken: string;
  pesoAmount: number;
  exhibits: ForensicExhibit[];
  moneyTrail: ForensicMoneyTrailStep[];
  confidence: "proven" | "probable";
  reconciliation: ForensicReconciliation;
  challengerReview: { alternativeExplanation: string; evidenceIds: string[]; outcome: "survived" | "closed"; reason: string };
};
export type ForensicDeclinedLead = { leadId: string; entity: string; signal: string; reason: string; toolCallsMade: string[]; closedBy: string; evidenceIds: string[] };
export type ForensicEvidence = { evidenceId: string; sourceTable: string; recordId: string; entityIds: string[]; description: string; amount: number | null; date: string | null; tool: string; whatItProves: string; whatItDoesNotProve: string };
export type ForensicToolExecution = { executionId: string; tool: string; timestamp: string; inputSummary: string; resultSummary: string; status: "running" | "completed" | "failed" | "skipped"; entityIds: string[]; recordIds: string[]; generatedEvidenceIds: string[]; durationMs: number };
export type ForensicAuditEvent = { sequence: number; timestamp: string; event: string; details: string; recordIds: string[]; evidenceIds: string[] };
export type ForensicRunBundle = {
  version: string;
  normalizedCaseSummary: { companyRfc: string; auditPeriod?: string; sourceFormat: string; inputDigest: string; counts: Record<string, number> };
  candidateLeads: Array<{ leadId: string; candidateScheme: string; entities: string[]; signal: string; score: number; reason: string; recordIds: string[]; recommendedTools: string[] }>;
  declinedLeads: ForensicDeclinedLead[];
  findings: ForensicFinding[];
  evidence: ForensicEvidence[];
  toolLog: ForensicToolExecution[];
  auditLog: ForensicAuditEvent[];
  metrics: { llmCalls: number; mxnCost: number; wallClockSeconds: number; deterministic: boolean; engineVersion: string; inputDigest: string };
  configSnapshot: Record<string, unknown>;
  submissionValidation: { status: "PASS" | "FAIL"; errors: string[] };
  submission: Record<string, unknown>;
  caseFileHtml?: string;
};

type JsonRecord = Record<string, unknown>;

export class ForensicRunClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForensicRunClientError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new ForensicRunClientError(`El ${label} no tiene una estructura válida.`);
  return value;
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function requiredString(value: unknown, label: string): string {
  const result = string(value).trim();
  if (!result) throw new ForensicRunClientError(`El run bundle no contiene ${label}.`);
  return result;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => typeof item === "string" ? [item] : []) : [];
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value, "registro numérico")).flatMap(([key, item]) => Number.isFinite(item) ? [[key, Number(item)]] : []));
}

function normalizeExhibit(value: JsonRecord): ForensicExhibit {
  return { exhibitId: requiredString(value.exhibit_id, "un exhibit ID"), sourceTable: requiredString(value.source_table, "una tabla de exhibit"), recordId: requiredString(value.record_id, "un record ID"), note: requiredString(value.note, "una nota de exhibit") };
}

function normalizeFinding(value: JsonRecord): ForensicFinding {
  const reconciliation = record(value.reconciliation, "reconciliación");
  const review = record(value.challenger_review, "revisión Challenger");
  const confidence = requiredString(value.confidence, "la confianza oficial");
  if (confidence !== "proven" && confidence !== "probable") throw new ForensicRunClientError("La confianza oficial no es válida.");
  return {
    findingId: requiredString(value.finding_id, "un finding ID"), schemeType: requiredString(value.scheme_type, "un tipo de esquema"), entities: strings(value.entities), narrative: requiredString(value.narrative, "narrativa"), ruleBroken: requiredString(value.rule_broken, "regla"), pesoAmount: number(value.peso_amount), exhibits: records(value.exhibits).map(normalizeExhibit),
    moneyTrail: records(value.money_trail).map((step) => ({ fromEntity: requiredString(step.from_entity, "origen de money trail"), toEntity: requiredString(step.to_entity, "destino de money trail"), amount: number(step.amount), date: requiredString(step.date, "fecha de money trail"), exhibitId: requiredString(step.exhibit_id, "exhibit de money trail") })),
    confidence,
    reconciliation: { claimed: number(reconciliation.claimed), actual: number(reconciliation.actual), passes: reconciliation.passes === true, explanation: requiredString(reconciliation.explanation, "explicación de reconciliación"), perTable: numericRecord(reconciliation.per_table) },
    challengerReview: { alternativeExplanation: requiredString(review.alternative_explanation, "explicación del Challenger"), evidenceIds: strings(review.evidence_ids), outcome: review.outcome === "closed" ? "closed" : "survived", reason: requiredString(review.reason, "resultado del Challenger") },
  };
}

export function normalizeForensicRunBundle(value: unknown): ForensicRunBundle {
  const bundle = record(value, "run bundle");
  const summary = record(bundle.normalized_case_summary, "resumen del caso");
  const counts = numericRecord(summary.counts);
  const validation = record(bundle.submission_validation, "validación de submission");
  const metrics = record(bundle.metrics, "métricas");
  return {
    version: requiredString(bundle.version, "versión del motor"),
    normalizedCaseSummary: { companyRfc: requiredString(summary.company_rfc, "RFC de empresa"), auditPeriod: string(summary.audit_period) || undefined, sourceFormat: requiredString(summary.source_format, "formato fuente"), inputDigest: requiredString(summary.input_digest, "input digest"), counts },
    candidateLeads: records(bundle.candidate_leads).map((lead) => ({ leadId: requiredString(lead.lead_id, "lead ID"), candidateScheme: requiredString(lead.candidate_scheme, "esquema candidato"), entities: strings(lead.entities), signal: requiredString(lead.signal, "señal"), score: number(lead.score), reason: requiredString(lead.reason, "razón del lead"), recordIds: strings(lead.record_ids), recommendedTools: strings(lead.recommended_tools) })),
    declinedLeads: records(bundle.declined_leads).map((lead) => ({ leadId: requiredString(lead.lead_id, "lead cerrado"), entity: requiredString(lead.entity, "entidad cerrada"), signal: requiredString(lead.signal, "señal cerrada"), reason: requiredString(lead.reason, "razón de cierre"), toolCallsMade: strings(lead.tool_calls_made), closedBy: requiredString(lead.closed_by, "rol de cierre"), evidenceIds: strings(lead.evidence_ids) })),
    findings: records(bundle.findings).map(normalizeFinding),
    evidence: records(bundle.evidence).map((evidence) => ({ evidenceId: requiredString(evidence.evidence_id, "evidence ID"), sourceTable: requiredString(evidence.source_table, "tabla de evidencia"), recordId: requiredString(evidence.record_id, "record ID de evidencia"), entityIds: strings(evidence.entity_ids), description: requiredString(evidence.description, "descripción de evidencia"), amount: typeof evidence.amount === "number" ? evidence.amount : null, date: string(evidence.date) || null, tool: requiredString(evidence.tool, "tool de evidencia"), whatItProves: requiredString(evidence.what_it_proves, "alcance de evidencia"), whatItDoesNotProve: requiredString(evidence.what_it_does_not_prove, "límite de evidencia") })),
    toolLog: records(bundle.tool_log).map((execution) => ({ executionId: requiredString(execution.execution_id, "execution ID"), tool: requiredString(execution.tool, "tool"), timestamp: requiredString(execution.timestamp, "timestamp"), inputSummary: string(execution.input_summary), resultSummary: string(execution.result_summary), status: execution.status === "failed" || execution.status === "skipped" || execution.status === "running" ? execution.status : "completed", entityIds: strings(execution.entity_ids), recordIds: strings(execution.record_ids), generatedEvidenceIds: strings(execution.generated_evidence_ids), durationMs: number(execution.duration_ms) })),
    auditLog: records(bundle.audit_log).map((event) => ({ sequence: number(event.sequence), timestamp: requiredString(event.timestamp, "timestamp de auditoría"), event: requiredString(event.event, "evento de auditoría"), details: requiredString(event.details, "detalle de auditoría"), recordIds: strings(event.record_ids), evidenceIds: strings(event.evidence_ids) })),
    metrics: { llmCalls: number(metrics.llm_calls), mxnCost: number(metrics.mxn_cost), wallClockSeconds: number(metrics.wall_clock_seconds), deterministic: metrics.deterministic === true, engineVersion: requiredString(metrics.engine_version, "engine version"), inputDigest: requiredString(metrics.input_digest, "digest de métricas") },
    configSnapshot: record(bundle.config_snapshot, "config snapshot"),
    submissionValidation: { status: validation.status === "PASS" ? "PASS" : "FAIL", errors: strings(validation.errors) },
    submission: record(bundle.submission, "submission"),
    caseFileHtml: string(bundle.case_file_html) || undefined,
  };
}