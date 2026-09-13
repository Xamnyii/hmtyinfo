import { CheckCircle2, CircleDashed, CloudOff, LoaderCircle, Wrench, XCircle } from "lucide-react";
import type { AvailableMcpTool, InvestigationDecision, McpConnectionStatus, ToolExecution } from "./cfdi-types";

type McpActivityPanelProps = {
  status: McpConnectionStatus;
  tools: AvailableMcpTool[];
  executions: ToolExecution[];
  decisions: InvestigationDecision[];
};

const statusStyles: Record<McpConnectionStatus, { label: string; className: string }> = {
  checking: { label: "CHECKING", className: "text-ramrod-muted-foreground" },
  connected: { label: "CONNECTED", className: "text-ramrod-primary" },
  unavailable: { label: "UNAVAILABLE", className: "text-orange-500" },
  error: { label: "ERROR", className: "text-red-500" },
};

function ExecutionIcon({ status }: { status: ToolExecution["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />;
  if (status === "running") return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-ramrod-primary" aria-hidden="true" />;
  return <CircleDashed className="h-3.5 w-3.5 text-ramrod-muted-foreground" aria-hidden="true" />;
}

export function McpActivityPanel({ status, tools, executions, decisions }: McpActivityPanelProps) {
  const statusStyle = statusStyles[status];
  const recentDecisions = decisions.filter((decision) => decision.type === "tool_skipped").slice(-2);

  return (
    <section className="border-t border-ramrod-foreground/15 pt-5" data-tour="mcp-tools" aria-labelledby="mcp-activity-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" />
          <h3 id="mcp-activity-title" className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">MCP ACTIVITY</h3>
        </div>
        <span className={`text-[9px] font-bold tracking-[0.1em] ${statusStyle.className}`}>{statusStyle.label}</span>
      </div>

      {tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Herramientas MCP disponibles">
          {tools.slice(0, 3).map((tool) => <span key={tool.name} title={tool.description} className="max-w-36 truncate border border-ramrod-foreground/15 px-1.5 py-1 text-[9px] font-medium text-ramrod-muted-foreground">{tool.name}</span>)}
          {tools.length > 3 && <span className="px-1.5 py-1 text-[9px] font-bold text-ramrod-muted-foreground">+{tools.length - 3}</span>}
        </div>
      )}

      {status === "unavailable" || status === "error" ? (
        <div className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-ramrod-muted-foreground"><CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><p>La investigación conserva los facts y signals obtenidos del análisis CFDI.</p></div>
      ) : null}

      {executions.length > 0 && (
        <ul className="mt-3 space-y-3" aria-label="Ejecuciones de herramientas MCP">
          {executions.slice(-4).reverse().map((execution) => (
            <li key={execution.executionId} className="grid grid-cols-[auto_1fr] gap-x-2 border-l border-ramrod-foreground/15 pl-2.5">
              <ExecutionIcon status={execution.status} />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2"><span className="truncate text-[10px] font-bold text-ramrod-foreground">{execution.tool}</span><span className="text-[9px] font-bold tracking-[0.08em] text-ramrod-muted-foreground">{execution.status.toUpperCase()}</span></div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-ramrod-muted-foreground">{execution.error || execution.resultSummary || execution.inputSummary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {recentDecisions.length > 0 && (
        <p className="mt-3 border-l border-ramrod-foreground/15 pl-2.5 text-[10px] leading-relaxed text-ramrod-muted-foreground">{recentDecisions[recentDecisions.length - 1].reason}</p>
      )}
    </section>
  );
}