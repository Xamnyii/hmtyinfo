export type XmlFileStatus = "pending" | "uploading" | "analyzing" | "parsed" | "error";

export type AnalysisSource = "python" | "browser-fallback";
export type EntityRole = "issuer" | "receiver";
export type SignalSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH";
export type McpConnectionStatus = "checking" | "connected" | "unavailable" | "error";
export type McpCapability = "SUPPLIER_LOOKUP" | "TRANSACTION_SEARCH" | "MONEY_TRACE" | "NETWORK_ANALYSIS" | "DOCUMENT_LOOKUP" | "EVIDENCE_LOOKUP";
export type InvestigationPhase = "NOT_STARTED" | "ANALYZING_SOURCE" | "IDENTIFYING_ENTITIES" | "CHECKING_SIGNALS" | "QUERYING_TOOLS" | "FOLLOWING_RELATIONSHIPS" | "BUILDING_EVIDENCE" | "ASSESSING_RISK" | "WAITING_FOR_HUMAN" | "COMPLETED";
export type ToolExecutionStatus = "running" | "completed" | "failed" | "skipped";
export type RiskLevel = "gray" | "orange" | "red";
export type HumanRecommendation = "NO_ACTION" | "MONITOR" | "HUMAN_REVIEW_REQUIRED" | "PREVENTIVE_HOLD_RECOMMENDED";

export type CfdiParty = {
  rfc?: string;
  name?: string;
  taxRegime?: string;
  fiscalAddress?: string;
  cfdiUse?: string;
};

export type CfdiConcept = {
  productServiceKey?: string;
  identificationNumber?: string;
  description?: string;
  quantity?: number;
  unitKey?: string;
  unit?: string;
  unitValue?: number;
  amount?: number;
  discount?: number;
};

export type ParsedCfdi = {
  invoiceId?: string;
  sourceFileIndex?: number;
  sourceFileName?: string;
  uuid?: string;
  version?: string;
  series?: string;
  folio?: string;
  date?: string;
  stampedAt?: string;
  subtotal?: number;
  total?: number;
  currency?: string;
  paymentMethod?: string;
  paymentForm?: string;
  voucherType?: string;
  expeditionPlace?: string;
  issuer: CfdiParty;
  receiver: CfdiParty;
  concepts: CfdiConcept[];
};

export type UploadedXmlFile = {
  id: string;
  name: string;
  size: number;
  status: XmlFileStatus;
  parsed?: ParsedCfdi;
  error?: string;
};

export type DetectedCompany = {
  rfc: string;
  name?: string;
};

export type CfdiEntity = {
  entityId: string;
  rfc: string;
  name?: string;
  roles: EntityRole[];
};

// A billing relationship is extracted from CFDI declarations, not from bank movements.
export type BillingRelationship = {
  relationshipId: string;
  issuerEntityId: string;
  receiverEntityId: string;
  invoiceIds: string[];
  invoiceCount: number;
  totalInvoiced: number;
  currency?: string;
};

export type FinancialTransaction = {
  transactionId: string;
  sourceEntityId: string;
  targetEntityId: string;
  amount: number;
  currency: string;
  timestamp?: string;
  sourceTool: string;
  evidenceIds: string[];
};

export type InvestigationEvidenceType = "invoice" | "transaction" | "supplier" | "network" | "document" | "analysis";

export type InvestigationEvidence = {
  evidenceId: string;
  evidenceType: InvestigationEvidenceType;
  source: string;
  sourceFile?: string;
  sourceTool?: string;
  sourceRecordId?: string;
  createdAt?: string;
  invoiceId?: string;
  entityIds?: string[];
  transactionIds?: string[];
  fact?: string;
  description?: string;
  whatItProves?: string;
  whatItDoesNotProve?: string;
  confidence?: number;
};

export type CfdiEvidence = InvestigationEvidence & {
  evidenceType: "invoice";
  sourceFile: string;
  invoiceId: string;
  fact: string;
};

export type CfdiSignal = {
  signalId: string;
  code: string;
  title: string;
  severity: SignalSeverity;
  description: string;
  entityIds: string[];
  invoiceIds: string[];
  evidenceIds: string[];
  confidence: number;
  whatItMeans: string;
  whatItDoesNotProve: string;
};

export type CfdiAnalysisMetrics = {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  invoiceCount: number;
  totalAmountByCurrency: Record<string, number>;
  uniqueEntities: number;
  uniqueIssuers: number;
  uniqueReceivers: number;
  relationshipCount: number;
  signalCount: number;
};

export type CfdiAnalysisSummary = {
  invoiceCount: number;
  entityCount: number;
  signalCount: number;
  highestSeverity?: SignalSeverity;
};

export type CfdiAnalysisFile = {
  fileIndex: number;
  name: string;
  size: number;
  status: "parsed" | "error";
  parsed?: ParsedCfdi;
  error?: string;
};

export type CfdiAnalysisResult = {
  analysisSource: AnalysisSource;
  files: CfdiAnalysisFile[];
  invoices: ParsedCfdi[];
  entities: CfdiEntity[];
  relationships: BillingRelationship[];
  evidence: CfdiEvidence[];
  signals: CfdiSignal[];
  metrics: CfdiAnalysisMetrics;
  summary: CfdiAnalysisSummary;
};

export type AvailableMcpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  capabilities: McpCapability[];
};

export type ToolExecution = {
  executionId: string;
  tool: string;
  capability: McpCapability;
  startedAt: string;
  finishedAt?: string;
  status: ToolExecutionStatus;
  inputSummary?: string;
  resultSummary?: string;
  generatedEvidenceIds: string[];
  error?: string;
  requestFingerprint: string;
};

export type InvestigationDecision = {
  decisionId: string;
  at: string;
  type: "tool_skipped" | "lead_discarded" | "risk_updated" | "system";
  title: string;
  reason: string;
  evidenceIds: string[];
};

export type InvestigationFinding = {
  findingId: string;
  title: string;
  description: string;
  evidenceIds: string[];
  entityIds: string[];
  confidence: number;
  status: "open" | "monitor" | "resolved";
};

export type InvestigationHypothesis = {
  hypothesisId: string;
  title: string;
  description: string;
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  confidence: number;
  status: "active" | "discarded";
};

export type DiscardedLead = {
  leadId: string;
  description: string;
  investigatedEvidenceIds: string[];
  reason: string;
  discardedAt: string;
  confidence: number;
};

export type RiskReason = {
  title: string;
  evidenceIds: string[];
  signalIds: string[];
};

export type RiskAssessment = {
  score: number;
  confidence: number;
  evidenceCoverage: number;
  level: RiskLevel;
  reasons: RiskReason[];
  missingInformation: string[];
  recommendation: HumanRecommendation;
};

export type InvestigationTimelineEvent = {
  eventId: string;
  at: string;
  message: string;
  evidenceIds: string[];
  executionId?: string;
};

export type InvestigationAgentState = {
  phase: InvestigationPhase;
  mcpStatus: McpConnectionStatus;
  availableTools: AvailableMcpTool[];
  toolExecutions: ToolExecution[];
  findings: InvestigationFinding[];
  hypotheses: InvestigationHypothesis[];
  discardedLeads: DiscardedLead[];
  riskAssessment: RiskAssessment;
  decisions: InvestigationDecision[];
  timeline: InvestigationTimelineEvent[];
  startedAt: string;
  completedAt?: string;
};

export type InvestigationCaseDraft = {
  caseId: string;
  createdAt: string;
  status: "investigating";
  analysisSource: AnalysisSource;
  sourceFiles: UploadedXmlFile[];
  invoices: ParsedCfdi[];
  entities: CfdiEntity[];
  relationships: BillingRelationship[];
  financialTransactions?: FinancialTransaction[];
  evidence: InvestigationEvidence[];
  signals: CfdiSignal[];
  metrics: CfdiAnalysisMetrics;
  summary: CfdiAnalysisSummary;
  totalAmount?: number;
  totalAmountByCurrency: Record<string, number>;
  detectedCompanies: DetectedCompany[];
  agent?: InvestigationAgentState;
};

export type InvestigationContext = Pick<
  InvestigationCaseDraft,
  "caseId" | "invoices" | "entities" | "relationships" | "financialTransactions" | "signals" | "evidence" | "metrics"
>;

export type InvestigationSummary = {
  invoiceCount: number;
  totalAmount: number;
  detectedCompanies: DetectedCompany[];
  currency?: string;
  hasMixedCurrencies: boolean;
};

export const MAX_XML_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_XML_FILES_PER_ANALYSIS = 20;
export const ACTIVE_CASE_STORAGE_KEY = "ramrod_active_case";