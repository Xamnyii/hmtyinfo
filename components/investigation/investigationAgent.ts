import type {
  AvailableMcpTool,
  CfdiEntity,
  CfdiSignal,
  DiscardedLead,
  FinancialTransaction,
  HumanRecommendation,
  InvestigationAgentState,
  InvestigationCaseDraft,
  InvestigationDecision,
  InvestigationEvidence,
  InvestigationFinding,
  InvestigationHypothesis,
  InvestigationPhase,
  InvestigationTimelineEvent,
  McpCapability,
  McpConnectionStatus,
  RiskAssessment,
  RiskLevel,
  SignalSeverity,
  ToolExecution,
} from "./cfdi-types";

export const MAX_TOOL_CALLS = 15;

type JsonRecord = Record<string, unknown>;

type ToolPlan = {
  tool: AvailableMcpTool;
  capability: McpCapability;
  target?: CfdiEntity;
  arguments: Record<string, unknown>;
};

type HealthResult = {
  status: McpConnectionStatus;
  error?: string;
};

export type InvestigationReasoner = {
  answerQuestion: (draft: InvestigationCaseDraft, question: string) => string;
  summarizeCase: (draft: InvestigationCaseDraft) => string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

function now(): string {
  return new Date().toISOString();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function safeResponseError(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  return optionalString(value.error) || optionalString(value.detail) || fallback;
}

function capabilityType(capability: McpCapability): InvestigationEvidence["evidenceType"] {
  if (capability === "SUPPLIER_LOOKUP") return "supplier";
  if (capability === "NETWORK_ANALYSIS") return "network";
  if (capability === "DOCUMENT_LOOKUP") return "document";
  return "analysis";
}

function classifyTool(name: string, description?: string, inputSchema?: unknown): McpCapability[] {
  const schemaFields = getSchemaProperties(inputSchema) ? Object.keys(getSchemaProperties(inputSchema) ?? {}) : [];
  const searchable = `${name} ${description ?? ""} ${schemaFields.join(" ")}`.toLowerCase();
  const capabilities: McpCapability[] = [];

  if (/supplier|proveedor|vendor|company|empresa|taxpayer/.test(searchable)) capabilities.push("SUPPLIER_LOOKUP");
  if (/transaction|transaccion|payment|pago|transfer|movement|movimiento/.test(searchable)) capabilities.push("TRANSACTION_SEARCH");
  if (/money.*trace|trace.*money|money.*trail|flow.*trace|rastro.*dinero/.test(searchable)) capabilities.push("MONEY_TRACE");
  if (/network|red|relationship|relacion|link|vinculo|association/.test(searchable)) capabilities.push("NETWORK_ANALYSIS");
  if (/document|documento|invoice|factura|cfdi/.test(searchable)) capabilities.push("DOCUMENT_LOOKUP");
  if (/evidence|evidencia|record|expediente/.test(searchable)) capabilities.push("EVIDENCE_LOOKUP");

  return capabilities;
}

function getSchemaProperties(inputSchema: unknown): JsonRecord | null {
  if (!isRecord(inputSchema) || !isRecord(inputSchema.properties)) return null;
  return inputSchema.properties;
}

function getSchemaRequired(inputSchema: unknown): string[] {
  return isRecord(inputSchema) ? stringArray(inputSchema.required) : [];
}

function normalizeTool(value: unknown): AvailableMcpTool | null {
  if (!isRecord(value)) return null;
  const name = optionalString(value.name);
  if (!name) return null;
  const description = optionalString(value.description);
  const inputSchema = value.inputSchema;
  return { name, description, inputSchema, capabilities: classifyTool(name, description, inputSchema) };
}

async function getMcpHealth(): Promise<HealthResult> {
  try {
    const response = await fetch("/api/mcp/health", { cache: "no-store" });
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok && isRecord(payload) && payload.ok === true) return { status: "connected" };
    return { status: "unavailable", error: safeResponseError(payload, "El servicio MCP no está disponible.") };
  } catch {
    return { status: "error", error: "No fue posible consultar el estado de MCP." };
  }
}

async function getMcpTools(): Promise<AvailableMcpTool[]> {
  const response = await fetch("/api/mcp/tools", { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    throw new Error(safeResponseError(payload, "No fue posible descubrir las herramientas MCP."));
  }
  return Array.isArray(payload.tools) ? payload.tools.flatMap((tool) => {
    const normalized = normalizeTool(tool);
    return normalized ? [normalized] : [];
  }) : [];
}

async function callMcpTool(tool: string, arguments_: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("/api/mcp/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, arguments: arguments_ }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    throw new Error(safeResponseError(payload, "La herramienta MCP no pudo completarse."));
  }
  return payload.result;
}

function argumentForProperty(property: string, draft: InvestigationCaseDraft, target?: CfdiEntity): unknown {
  const normalized = property.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const firstInvoice = draft.invoices[0];
  const firstRelationship = draft.relationships[0];

  if (["rfc", "taxid", "taxpayerid", "companyrfc"].includes(normalized)) return target?.rfc;
  if (["entityid", "companyid", "supplierid"].includes(normalized)) return target?.entityId;
  if (["company", "companyname", "supplier", "suppliername", "entityname", "name"].includes(normalized)) return target?.name || target?.rfc;
  if (["caseid", "investigationid"].includes(normalized)) return draft.caseId;
  if (["invoiceid", "cfdiid"].includes(normalized)) return firstInvoice?.invoiceId;
  if (["uuid", "fiscaluuid"].includes(normalized)) return firstInvoice?.uuid;
  if (["relationshipid", "billingrelationshipid"].includes(normalized)) return firstRelationship?.relationshipId;
  if (["issuerentityid", "sourceentityid"].includes(normalized)) return firstRelationship?.issuerEntityId;
  if (["receiverentityid", "targetentityid"].includes(normalized)) return firstRelationship?.receiverEntityId;
  if (["query", "search", "searchterm"].includes(normalized)) return target?.rfc || target?.name;
  if (["limit", "maxresults", "pagesize"].includes(normalized)) return 25;
  return undefined;
}

function buildArguments(tool: AvailableMcpTool, draft: InvestigationCaseDraft, target?: CfdiEntity): Record<string, unknown> | null {
  const properties = getSchemaProperties(tool.inputSchema);
  const required = getSchemaRequired(tool.inputSchema);
  if (!properties && required.length > 0) return null;
  if (!properties) return {};

  const arguments_: Record<string, unknown> = {};
  for (const property of Object.keys(properties)) {
    const value = argumentForProperty(property, draft, target);
    if (value !== undefined) arguments_[property] = value;
  }
  if (required.some((property) => !(property in arguments_))) return null;
  return arguments_;
}

function createRequestFingerprint(tool: AvailableMcpTool, arguments_: Record<string, unknown>): string {
  return `${tool.name}:${JSON.stringify(Object.entries(arguments_).sort(([left], [right]) => left.localeCompare(right)))}`;
}

function createTimelineEvent(state: InvestigationAgentState, message: string, evidenceIds: string[] = [], executionId?: string): InvestigationTimelineEvent {
  return {
    eventId: `EVT-${String(state.timeline.length + 1).padStart(3, "0")}`,
    at: now(),
    message,
    evidenceIds: unique(evidenceIds),
    executionId,
  };
}

function withTimeline(state: InvestigationAgentState, message: string, evidenceIds: string[] = [], executionId?: string): InvestigationAgentState {
  return { ...state, timeline: [...state.timeline, createTimelineEvent(state, message, evidenceIds, executionId)] };
}

function createDecision(state: InvestigationAgentState, decision: Omit<InvestigationDecision, "decisionId" | "at">): InvestigationAgentState {
  return {
    ...state,
    decisions: [
      ...state.decisions,
      { ...decision, decisionId: `DEC-${String(state.decisions.length + 1).padStart(3, "0")}`, at: now(), evidenceIds: unique(decision.evidenceIds) },
    ],
  };
}

function severityWeight(severity: SignalSeverity): number {
  return { INFO: 4, LOW: 12, MEDIUM: 25, HIGH: 40 }[severity];
}

function deriveFindings(signals: CfdiSignal[]): InvestigationFinding[] {
  return signals
    .filter((signal) => signal.evidenceIds.length > 0)
    .map((signal, index) => ({
      findingId: `F-${String(index + 1).padStart(3, "0")}`,
      title: signal.title,
      description: signal.description,
      evidenceIds: unique(signal.evidenceIds),
      entityIds: unique(signal.entityIds),
      confidence: signal.confidence,
      status: "open",
    }));
}

function deriveHypotheses(signals: CfdiSignal[]): InvestigationHypothesis[] {
  const reviewSignals = signals.filter((signal) => signal.severity !== "INFO" && signal.evidenceIds.length > 0);
  if (reviewSignals.length === 0) return [];

  return [{
    hypothesisId: "H-001",
    title: "Se requiere contexto adicional sobre las anomalías documentales",
    description: "Las señales observadas en los CFDI justifican una revisión contextual; no constituyen una conclusión de fraude.",
    supportingEvidenceIds: unique(reviewSignals.flatMap((signal) => signal.evidenceIds)),
    contradictoryEvidenceIds: [],
    confidence: Math.min(0.9, reviewSignals.reduce((total, signal) => total + signal.confidence, 0) / reviewSignals.length),
    status: "active",
  }];
}

function deriveDiscardedLeads(draft: InvestigationCaseDraft): DiscardedLead[] {
  if (draft.relationships.length === 0) return [];
  return [{
    leadId: "L-001",
    description: "Rastro de transacciones financieras",
    investigatedEvidenceIds: unique(draft.evidence.flatMap((evidence) => evidence.invoiceId ? [evidence.evidenceId] : [])),
    reason: "Los CFDI confirman relaciones de facturación, no transferencias financieras verificadas. No se infiere un flujo de dinero sin una fuente transaccional.",
    discardedAt: now(),
    confidence: 1,
  }];
}

function calculateRisk(draft: InvestigationCaseDraft, state: InvestigationAgentState): RiskAssessment {
  const findings = state.findings.filter((finding) => finding.evidenceIds.length > 0);
  const evidenceTypes = new Set(draft.evidence.map((evidence) => evidence.evidenceType));
  const sourceCoverage = (evidenceTypes.has("invoice") ? 45 : 0) + Math.min(3, [...evidenceTypes].filter((type) => type !== "invoice").length) * 15;
  const evidenceCoverage = Math.min(100, sourceCoverage);
  const weightedSignals = draft.signals.reduce((total, signal) => total + severityWeight(signal.severity), 0);
  const score = Math.min(100, weightedSignals + Math.min(20, findings.length * 4));
  const hasConvergentEvidence = new Set(draft.signals.map((signal) => signal.code)).size >= 3 && findings.length >= 3 && draft.evidence.length >= 3;
  const hasHighSignal = draft.signals.some((signal) => signal.severity === "HIGH");
  const level: RiskLevel = findings.length === 0 ? "gray" : hasConvergentEvidence && hasHighSignal ? "red" : "orange";
  const confidence = Math.min(100, Math.round(evidenceCoverage * 0.65 + Math.min(35, findings.length * 7)));
  const missingInformation = [
    ...(evidenceTypes.has("supplier") ? [] : ["Información de proveedor verificada"]),
    ...(evidenceTypes.has("transaction") ? [] : ["Transacciones financieras verificadas"]),
    ...(evidenceTypes.has("document") ? [] : ["Contratos o evidencia de entrega"]),
  ];
  const recommendation: HumanRecommendation = level === "red" && evidenceCoverage >= 80 && findings.length >= 4
    ? "PREVENTIVE_HOLD_RECOMMENDED"
    : level === "red"
      ? "HUMAN_REVIEW_REQUIRED"
      : level === "orange"
        ? "MONITOR"
        : "NO_ACTION";

  return {
    score,
    confidence,
    evidenceCoverage,
    level,
    reasons: draft.signals.slice(0, 3).map((signal) => ({ title: signal.title, evidenceIds: unique(signal.evidenceIds), signalIds: [signal.signalId] })),
    missingInformation,
    recommendation,
  };
}

function refreshRiskAssessment(draft: InvestigationCaseDraft, state: InvestigationAgentState): InvestigationAgentState {
  const nextRisk = calculateRisk(draft, state);
  const previousRisk = state.riskAssessment;
  let nextState = { ...state, riskAssessment: nextRisk };
  if (
    previousRisk.level === nextRisk.level
    && previousRisk.score === nextRisk.score
    && previousRisk.evidenceCoverage === nextRisk.evidenceCoverage
  ) {
    return nextState;
  }

  const evidenceIds = unique(nextRisk.reasons.flatMap((reason) => reason.evidenceIds));
  nextState = createDecision(nextState, {
    type: "risk_updated",
    title: `${previousRisk.level.toUpperCase()} → ${nextRisk.level.toUpperCase()}`,
    reason: "La evaluación preliminar se actualizó con las señales y evidencia trazable disponibles.",
    evidenceIds,
  });
  return withTimeline(nextState, `Riesgo preliminar actualizado: ${previousRisk.level.toUpperCase()} → ${nextRisk.level.toUpperCase()}.`, evidenceIds);
}

function emptyRiskAssessment(): RiskAssessment {
  return {
    score: 0,
    confidence: 0,
    evidenceCoverage: 0,
    level: "gray",
    reasons: [],
    missingInformation: ["Información de proveedor verificada", "Transacciones financieras verificadas", "Contratos o evidencia de entrega"],
    recommendation: "NO_ACTION",
  };
}

export function createInitialAgentState(draft: InvestigationCaseDraft): InvestigationAgentState {
  const startedAt = now();
  let state: InvestigationAgentState = {
    phase: "NOT_STARTED",
    mcpStatus: "checking",
    availableTools: [],
    toolExecutions: [],
    findings: deriveFindings(draft.signals),
    hypotheses: deriveHypotheses(draft.signals),
    discardedLeads: deriveDiscardedLeads(draft),
    riskAssessment: emptyRiskAssessment(),
    decisions: [],
    timeline: [{ eventId: "EVT-001", at: startedAt, message: "Investigación iniciada con el análisis CFDI.", evidenceIds: [] }],
    startedAt,
  };
  state = { ...state, riskAssessment: calculateRisk(draft, state) };
  return state;
}

export function applyHypothesisEvidence(
  hypothesis: InvestigationHypothesis,
  evidenceId: string,
  relation: "supporting" | "contradictory",
): InvestigationHypothesis {
  const supportingEvidenceIds = relation === "supporting"
    ? unique([...hypothesis.supportingEvidenceIds, evidenceId])
    : hypothesis.supportingEvidenceIds;
  const contradictoryEvidenceIds = relation === "contradictory"
    ? unique([...hypothesis.contradictoryEvidenceIds, evidenceId])
    : hypothesis.contradictoryEvidenceIds;
  const confidenceDelta = relation === "supporting" ? 0.08 : -0.18;
  const confidence = Math.min(1, Math.max(0, hypothesis.confidence + confidenceDelta));

  return {
    ...hypothesis,
    supportingEvidenceIds,
    contradictoryEvidenceIds,
    confidence,
    status: confidence < 0.2 ? "discarded" : hypothesis.status,
  };
}

function summarizeToolResult(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) return "Respuesta MCP recibida.";
  return result.content.length === 1 ? "Respuesta MCP recibida." : `${result.content.length} elementos recibidos desde MCP.`;
}

function extractVerifiedFinancialTransactions(result: unknown, sourceTool: string): FinancialTransaction[] {
  if (!isRecord(result) || !isRecord(result.structuredContent)) return [];
  const structuredContent = result.structuredContent;
  const transactions = Array.isArray(structuredContent.transactions)
    ? structuredContent.transactions
    : Array.isArray(structuredContent.financialTransactions)
      ? structuredContent.financialTransactions
      : [];

  return transactions.flatMap((transaction) => {
    if (!isRecord(transaction)) return [];
    const transactionId = optionalString(transaction.transactionId);
    const sourceEntityId = optionalString(transaction.sourceEntityId);
    const targetEntityId = optionalString(transaction.targetEntityId);
    const amount = optionalNumber(transaction.amount);
    const currency = optionalString(transaction.currency);
    if (!transactionId || !sourceEntityId || !targetEntityId || amount === undefined || !currency) return [];

    return [{
      transactionId,
      sourceEntityId,
      targetEntityId,
      amount,
      currency,
      timestamp: optionalString(transaction.timestamp),
      sourceTool,
      evidenceIds: [],
    }];
  });
}

function buildMcpEvidence(state: InvestigationAgentState, plan: ToolPlan, execution: ToolExecution): InvestigationEvidence {
  return {
    evidenceId: `E-${String(state.toolExecutions.flatMap((item) => item.generatedEvidenceIds).length + 1).padStart(3, "0")}-MCP`,
    evidenceType: capabilityType(plan.capability),
    source: "MCP tool response",
    sourceTool: plan.tool.name,
    createdAt: execution.finishedAt,
    entityIds: plan.target ? [plan.target.entityId] : [],
    description: execution.resultSummary,
    whatItProves: `La herramienta ${plan.tool.name} respondió para el contexto proporcionado.`,
    whatItDoesNotProve: "La respuesta de una herramienta requiere revisión y no demuestra por sí sola una irregularidad.",
    confidence: 1,
  };
}

function buildTransactionEvidence(
  state: InvestigationAgentState,
  execution: ToolExecution,
  transaction: FinancialTransaction,
  index: number,
): InvestigationEvidence {
  const existingEvidenceCount = state.toolExecutions.flatMap((item) => item.generatedEvidenceIds).length;
  return {
    evidenceId: `E-${String(existingEvidenceCount + index + 1).padStart(3, "0")}-MCP`,
    evidenceType: "transaction",
    source: "MCP structured transaction response",
    sourceTool: transaction.sourceTool,
    sourceRecordId: transaction.transactionId,
    createdAt: execution.finishedAt,
    entityIds: [transaction.sourceEntityId, transaction.targetEntityId],
    transactionIds: [transaction.transactionId],
    description: `Movimiento ${transaction.transactionId}: ${transaction.sourceEntityId} a ${transaction.targetEntityId} por ${transaction.amount} ${transaction.currency}.`,
    whatItProves: "La herramienta MCP devolvió un movimiento financiero estructurado con identificador, origen, destino, monto y moneda.",
    whatItDoesNotProve: "Un movimiento financiero verificado no demuestra por sí solo una irregularidad o fraude.",
    confidence: 1,
  };
}

function selectToolPlan(tools: AvailableMcpTool[], capability: McpCapability, draft: InvestigationCaseDraft, target?: CfdiEntity): ToolPlan | null {
  for (const tool of tools) {
    if (!tool.capabilities.includes(capability)) continue;
    const arguments_ = buildArguments(tool, draft, target);
    if (arguments_) return { tool, capability, target, arguments: arguments_ };
  }
  return null;
}

function createToolPlans(tools: AvailableMcpTool[], draft: InvestigationCaseDraft): { plans: ToolPlan[]; skipped: Array<{ capability: McpCapability; reason: string }> } {
  const plans: ToolPlan[] = [];
  const skipped: Array<{ capability: McpCapability; reason: string }> = [];
  const primaryEntities = draft.entities.slice(0, 3);

  if (primaryEntities.length === 0) {
    skipped.push({ capability: "SUPPLIER_LOOKUP", reason: "No hay entidades con RFC disponible para consultar." });
  } else {
    for (const entity of primaryEntities) {
      const plan = selectToolPlan(tools, "SUPPLIER_LOOKUP", draft, entity);
      if (plan) plans.push(plan);
      else skipped.push({ capability: "SUPPLIER_LOOKUP", reason: "No hay una herramienta de proveedor compatible con el contexto disponible." });
    }
  }

  for (const capability of ["TRANSACTION_SEARCH", "NETWORK_ANALYSIS", "DOCUMENT_LOOKUP", "EVIDENCE_LOOKUP"] as const) {
    const plan = selectToolPlan(tools, capability, draft, primaryEntities[0]);
    if (plan) plans.push(plan);
    else skipped.push({ capability, reason: "No hay una herramienta MCP compatible con el esquema de entrada disponible." });
  }

  skipped.push({ capability: "MONEY_TRACE", reason: "No hay identificadores de transacciones financieras verificadas en el análisis CFDI actual." });
  return { plans, skipped };
}

export async function runInvestigationAgent(
  draft: InvestigationCaseDraft,
  onUpdate: (state: InvestigationAgentState, evidence: InvestigationEvidence[], financialTransactions: FinancialTransaction[]) => void,
): Promise<InvestigationAgentState> {
  let state = draft.agent ?? createInitialAgentState(draft);
  let collectedEvidence = [...draft.evidence];
  let collectedFinancialTransactions = [...(draft.financialTransactions ?? [])];
  const publish = () => onUpdate(state, collectedEvidence, collectedFinancialTransactions);
  const updatePhase = (phase: InvestigationPhase, message: string) => {
    state = withTimeline({ ...state, phase }, message);
    publish();
  };

  updatePhase("ANALYZING_SOURCE", "Análisis CFDI cargado.");
  updatePhase("IDENTIFYING_ENTITIES", `${draft.metrics.uniqueEntities} entidades identificadas.`);
  updatePhase("CHECKING_SIGNALS", `${draft.metrics.signalCount} señales revisadas.`);
  state = refreshRiskAssessment(draft, state);
  publish();

  const health = await getMcpHealth();
  state = withTimeline({ ...state, mcpStatus: health.status }, health.status === "connected" ? "MCP conectado." : health.error || "MCP no disponible.");
  publish();

  if (health.status !== "connected") {
    updatePhase("BUILDING_EVIDENCE", "La investigación continúa con evidencia CFDI disponible.");
    updatePhase("ASSESSING_RISK", "Evaluación preliminar de riesgo actualizada.");
    const finalPhase: InvestigationPhase = state.riskAssessment.recommendation === "HUMAN_REVIEW_REQUIRED" || state.riskAssessment.recommendation === "PREVENTIVE_HOLD_RECOMMENDED" ? "WAITING_FOR_HUMAN" : "COMPLETED";
    state = { ...state, phase: finalPhase, completedAt: now() };
    publish();
    return state;
  }

  updatePhase("QUERYING_TOOLS", "Descubriendo herramientas MCP disponibles.");
  try {
    const availableTools = await getMcpTools();
    state = withTimeline({ ...state, availableTools }, availableTools.length > 0 ? `${availableTools.length} herramientas MCP disponibles.` : "El servidor MCP no expuso herramientas compatibles.");
    publish();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible descubrir las herramientas MCP.";
    state = withTimeline({ ...state, mcpStatus: "error" }, message);
    publish();
  }

  const { plans, skipped } = createToolPlans(state.availableTools, draft);
  for (const skippedCapability of skipped) {
    state = createDecision(state, {
      type: "tool_skipped",
      title: `${skippedCapability.capability} omitida`,
      reason: skippedCapability.reason,
      evidenceIds: [],
    });
  }
  publish();

  for (const plan of plans) {
    if (state.toolExecutions.filter((execution) => execution.status !== "skipped").length >= MAX_TOOL_CALLS) {
      state = withTimeline(state, "Se alcanzó el límite de llamadas de herramientas para esta investigación.");
      break;
    }
    const requestFingerprint = createRequestFingerprint(plan.tool, plan.arguments);
    if (state.toolExecutions.some((execution) => execution.requestFingerprint === requestFingerprint)) continue;

    const executionId = `MCP-${String(state.toolExecutions.length + 1).padStart(3, "0")}`;
    const runningExecution: ToolExecution = {
      executionId,
      tool: plan.tool.name,
      capability: plan.capability,
      startedAt: now(),
      status: "running",
      inputSummary: plan.target ? `Contexto de entidad ${plan.target.entityId}.` : "Contexto del caso.",
      generatedEvidenceIds: [],
      requestFingerprint,
    };
    state = { ...state, toolExecutions: [...state.toolExecutions, runningExecution] };
    publish();

    try {
      const result = await callMcpTool(plan.tool.name, plan.arguments);
      const completedExecution: ToolExecution = {
        ...runningExecution,
        status: "completed",
        finishedAt: now(),
        resultSummary: summarizeToolResult(result),
      };
      const knownTransactions = new Set(collectedFinancialTransactions.map((transaction) => `${transaction.sourceTool}:${transaction.transactionId}`));
      const verifiedTransactions = extractVerifiedFinancialTransactions(result, plan.tool.name)
        .filter((transaction) => !knownTransactions.has(`${transaction.sourceTool}:${transaction.transactionId}`));
      const generatedEvidence = verifiedTransactions.length > 0
        ? verifiedTransactions.map((transaction, index) => buildTransactionEvidence(state, completedExecution, transaction, index))
        : [buildMcpEvidence(state, plan, completedExecution)];
      completedExecution.generatedEvidenceIds = generatedEvidence.map((evidence) => evidence.evidenceId);
      collectedEvidence = [...collectedEvidence, ...generatedEvidence];
      collectedFinancialTransactions = [
        ...collectedFinancialTransactions,
        ...verifiedTransactions.map((transaction, index) => ({ ...transaction, evidenceIds: [generatedEvidence[index].evidenceId] })),
      ];
      state = {
        ...state,
        toolExecutions: state.toolExecutions.map((execution) => execution.executionId === executionId ? completedExecution : execution),
      };
      state = withTimeline(state, `${plan.tool.name} completó una consulta.`, completedExecution.generatedEvidenceIds, executionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "La herramienta MCP no pudo completarse.";
      const failedExecution: ToolExecution = { ...runningExecution, status: "failed", finishedAt: now(), error: message };
      state = {
        ...state,
        toolExecutions: state.toolExecutions.map((execution) => execution.executionId === executionId ? failedExecution : execution),
      };
      state = withTimeline(state, `${plan.tool.name} no pudo completarse.`, [], executionId);
    }
    publish();
  }

  updatePhase("FOLLOWING_RELATIONSHIPS", `${draft.relationships.length} relaciones de facturación conservadas como contexto documental.`);
  updatePhase("BUILDING_EVIDENCE", `${collectedEvidence.length} elementos de evidencia trazables disponibles.`);
  const recalculatedDraft = { ...draft, evidence: collectedEvidence, financialTransactions: collectedFinancialTransactions };
  state = refreshRiskAssessment(recalculatedDraft, state);
  updatePhase("ASSESSING_RISK", "Evaluación preliminar de riesgo actualizada.");
  const finalPhase: InvestigationPhase = state.riskAssessment.recommendation === "HUMAN_REVIEW_REQUIRED" || state.riskAssessment.recommendation === "PREVENTIVE_HOLD_RECOMMENDED" ? "WAITING_FOR_HUMAN" : "COMPLETED";
  state = { ...state, phase: finalPhase, completedAt: now() };
  publish();
  return state;
}

function evidenceLabels(evidenceIds: string[]): string {
  return evidenceIds.length > 0 ? evidenceIds.join(", ") : "No hay evidencia identificada.";
}

export const deterministicInvestigationReasoner: InvestigationReasoner = {
  summarizeCase(draft) {
    const agent = draft.agent;
    if (!agent) return "El caso contiene análisis CFDI, pero RamRod todavía no ha terminado la investigación estructurada.";
    return `El análisis reúne ${draft.metrics.invoiceCount} facturas, ${draft.metrics.uniqueEntities} entidades y ${draft.metrics.signalCount} señales. El riesgo preliminar es ${agent.riskAssessment.level.toUpperCase()} con cobertura de evidencia de ${agent.riskAssessment.evidenceCoverage}%.`;
  },
  answerQuestion(draft, question) {
    const agent = draft.agent;
    if (!agent) return "RamRod aún está preparando el contexto estructurado de este caso.";
    const normalizedQuestion = question.toLocaleLowerCase("es-MX");
    if (/por qu[eé]|raz[oó]n|marc/.test(normalizedQuestion)) {
      const reasons = agent.riskAssessment.reasons.map((reason) => `${reason.title} (${evidenceLabels(reason.evidenceIds)})`);
      return reasons.length > 0
        ? `La evaluación preliminar se basa en: ${reasons.join("; ")}. La información disponible no demuestra por sí sola fraude.`
        : "No hay señales respaldadas por evidencia suficiente para explicar una clasificación de riesgo.";
    }
    if (/evidencia|respalda|evidence/.test(normalizedQuestion)) {
      return draft.evidence.length > 0
        ? `La evidencia disponible incluye ${draft.evidence.slice(0, 5).map((evidence) => evidence.evidenceId).join(", ")}. Cada elemento conserva su fuente y alcance.`
        : "No hay evidencia trazable adicional en el caso.";
    }
    if (/pista|descart/.test(normalizedQuestion)) {
      return agent.discardedLeads.length > 0
        ? `${agent.discardedLeads[0].leadId}: ${agent.discardedLeads[0].reason}`
        : "No se han descartado pistas en esta investigación.";
    }
    if (/falta|missing|informaci[oó]n/.test(normalizedQuestion)) {
      return agent.riskAssessment.missingInformation.length > 0
        ? `Información pendiente: ${agent.riskAssessment.missingInformation.join("; ")}.`
        : "Las fuentes previstas para esta etapa ya están cubiertas.";
    }
    return deterministicInvestigationReasoner.summarizeCase(draft);
  },
};