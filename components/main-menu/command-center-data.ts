export type RiskLevel = "gray" | "orange" | "red";

export type AgentStatus = "IDLE" | "INVESTIGATING" | "ANALYZING" | "WAITING FOR HUMAN";

export type RecentInvestigation = {
  caseId: string;
  company: string;
  risk: RiskLevel;
  amount: string;
  status: AgentStatus;
  diagnosis: "Peligroso" | "Monitorear" | "No peligroso";
  confidence: number;
  aiSummary: string;
  confirmation: string;
  metrics: {
    invoices: number;
    evidence: number;
    riskScore: number;
    mcpMatches: number;
  };
  comparisonRows: Array<{
    factor: string;
    observed: string;
    expected: string;
    verdict: "OK" | "Revisar" | "Alto riesgo";
  }>;
};

export const mockAgentStatus: AgentStatus = "IDLE";

export const mockRecentInvestigations: RecentInvestigation[] = [
  {
    caseId: "CASE-0042",
    company: "Servicios Delta",
    risk: "orange",
    amount: "$4.8M MXN",
    status: "INVESTIGATING",
    diagnosis: "Monitorear",
    confidence: 74,
    aiSummary: "Se detecta concentración alta de facturación con señales documentales medias, pero falta evidencia bancaria o sancionatoria para marcar peligro confirmado.",
    confirmation: "No se confirma peligro inmediato; se recomienda revisión humana y solicitar soporte operativo.",
    metrics: {
      invoices: 18,
      evidence: 11,
      riskScore: 64,
      mcpMatches: 2,
    },
    comparisonRows: [
      { factor: "Concentración por contraparte", observed: "82%", expected: "< 60%", verdict: "Revisar" },
      { factor: "Documentos con UUID válido", observed: "18/18", expected: "18/18", verdict: "OK" },
      { factor: "Coincidencias MCP", observed: "2 leads", expected: "0-1", verdict: "Revisar" },
    ],
  },
  {
    caseId: "CASE-0039",
    company: "Grupo Norte",
    risk: "red",
    amount: "$2.1M MXN",
    status: "WAITING FOR HUMAN",
    diagnosis: "Peligroso",
    confidence: 91,
    aiSummary: "El caso combina UUID repetido, relación comercial atípica y coincidencias de dirección/oficiales. La evidencia acumulada justifica detener aprobación automática.",
    confirmation: "Sí se confirma como peligroso para flujo automático; requiere bloqueo preventivo y revisión de evidencia fuente.",
    metrics: {
      invoices: 7,
      evidence: 15,
      riskScore: 88,
      mcpMatches: 5,
    },
    comparisonRows: [
      { factor: "UUID duplicado", observed: "2 archivos", expected: "0", verdict: "Alto riesgo" },
      { factor: "Dirección compartida", observed: "Coincidencia exacta", expected: "Sin coincidencia", verdict: "Alto riesgo" },
      { factor: "Soporte documental", observed: "Incompleto", expected: "Contrato + OC", verdict: "Revisar" },
    ],
  },
  {
    caseId: "CASE-0035",
    company: "Logistica Central",
    risk: "gray",
    amount: "$860K MXN",
    status: "ANALYZING",
    diagnosis: "No peligroso",
    confidence: 83,
    aiSummary: "Las facturas tienen estructura consistente, montos dentro del patrón observado y no hay coincidencias MCP relevantes. Mantener monitoreo normal.",
    confirmation: "No se confirma peligro con la evidencia disponible.",
    metrics: {
      invoices: 5,
      evidence: 5,
      riskScore: 24,
      mcpMatches: 0,
    },
    comparisonRows: [
      { factor: "Montos fuera de patrón", observed: "0", expected: "0", verdict: "OK" },
      { factor: "Relaciones de facturación", observed: "1 estable", expected: "1-2", verdict: "OK" },
      { factor: "Coincidencias MCP", observed: "0", expected: "0", verdict: "OK" },
    ],
  },
];

export const mockMcpStatus = "MCP TOOLS READY";
