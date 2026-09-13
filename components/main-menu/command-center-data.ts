export type RiskLevel = "gray" | "orange" | "red";

export type AgentStatus = "IDLE" | "INVESTIGATING" | "ANALYZING" | "WAITING FOR HUMAN";

export type RecentInvestigation = {
  caseId: string;
  company: string;
  risk: RiskLevel;
  amount: string;
  status: AgentStatus;
};

export const mockAgentStatus: AgentStatus = "IDLE";

export const mockRecentInvestigations: RecentInvestigation[] = [
  {
    caseId: "CASE-0042",
    company: "Servicios Delta",
    risk: "orange",
    amount: "$4.8M MXN",
    status: "INVESTIGATING",
  },
  {
    caseId: "CASE-0039",
    company: "Grupo Norte",
    risk: "red",
    amount: "$2.1M MXN",
    status: "WAITING FOR HUMAN",
  },
  {
    caseId: "CASE-0035",
    company: "Logistica Central",
    risk: "gray",
    amount: "$860K MXN",
    status: "ANALYZING",
  },
];

export const mockMcpStatus = "MCP TOOLS READY";