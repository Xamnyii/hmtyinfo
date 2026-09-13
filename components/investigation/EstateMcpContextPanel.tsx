"use client";

import { CheckCircle2, CircleDashed, CloudOff, LoaderCircle, Wrench, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Status = "checking" | "running" | "completed" | "failed" | "skipped";
type McpTool = { name: string; description?: string; inputSchema?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compatibleArguments(inputSchema: unknown, companyRfc: string): Record<string, string> | null {
  if (!isRecord(inputSchema) || !isRecord(inputSchema.properties)) return null;
  const supported = new Set(["rfc", "taxid", "taxpayerid", "companyrfc", "company", "companyname", "entityname", "name"]);
  const arguments_: Record<string, string> = {};
  for (const property of Object.keys(inputSchema.properties)) {
    if (supported.has(property.replace(/[^a-z0-9]/gi, "").toLowerCase())) arguments_[property] = companyRfc;
  }
  const required = Array.isArray(inputSchema.required) ? inputSchema.required.filter((value): value is string => typeof value === "string") : [];
  return Object.keys(arguments_).length > 0 && required.every((property) => property in arguments_) ? arguments_ : null;
}

function resultSummary(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.content)) return "MCP returned context for the requested entity.";
  return value.content.length === 1 ? "MCP returned one context item for the requested entity." : `MCP returned ${value.content.length} context items for the requested entity.`;
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" />;
  if (status === "running" || status === "checking") return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-ramrod-primary" aria-hidden="true" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />;
  return <CircleDashed className="h-3.5 w-3.5 text-ramrod-muted-foreground" aria-hidden="true" />;
}

export function EstateMcpContextPanel({ companyRfc }: { companyRfc: string }) {
  const startedForRfc = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("checking");
  const [tools, setTools] = useState<McpTool[]>([]);
  const [message, setMessage] = useState("Checking optional MCP context.");

  useEffect(() => {
    if (!companyRfc || startedForRfc.current === companyRfc) return;
    startedForRfc.current = companyRfc;
    let active = true;
    const update = (nextStatus: Status, nextMessage: string) => {
      if (!active) return;
      setStatus(nextStatus);
      setMessage(nextMessage);
    };
    void (async () => {
      try {
        const healthResponse = await fetch("/api/mcp/health", { cache: "no-store" });
        const health: unknown = await healthResponse.json().catch(() => null);
        if (!healthResponse.ok || !isRecord(health) || health.ok !== true) {
          update("skipped", "MCP is unavailable; official analysis remains local and complete.");
          return;
        }
        const toolsResponse = await fetch("/api/mcp/tools", { cache: "no-store" });
        const toolsPayload: unknown = await toolsResponse.json().catch(() => null);
        if (!toolsResponse.ok || !isRecord(toolsPayload) || toolsPayload.ok !== true || !Array.isArray(toolsPayload.tools)) {
          update("failed", "MCP tools could not be discovered. No official result was affected.");
          return;
        }
        const availableTools = toolsPayload.tools.flatMap((value): McpTool[] => {
          if (!isRecord(value) || typeof value.name !== "string" || !value.name) return [];
          return [{ name: value.name, description: typeof value.description === "string" ? value.description : undefined, inputSchema: value.inputSchema }];
        });
        if (active) setTools(availableTools);
        const compatible = availableTools.map((tool) => ({ tool, arguments_: compatibleArguments(tool.inputSchema, companyRfc) })).find((candidate) => candidate.arguments_ !== null);
        if (!compatible || !compatible.arguments_) {
          update("skipped", "No discovered MCP tool accepts the verified company RFC schema.");
          return;
        }
        update("running", `Calling compatible MCP tool ${compatible.tool.name}.`);
        const callResponse = await fetch("/api/mcp/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: compatible.tool.name, arguments: compatible.arguments_ }) });
        const callPayload: unknown = await callResponse.json().catch(() => null);
        if (!callResponse.ok || !isRecord(callPayload) || callPayload.ok !== true) {
          update("failed", `MCP tool ${compatible.tool.name} failed. No official result was affected.`);
          return;
        }
        update("completed", `${compatible.tool.name}: ${resultSummary(callPayload.result)}`);
      } catch {
        update("failed", "MCP context could not be reached. No official result was affected.");
      }
    })();
    return () => { active = false; };
  }, [companyRfc]);

  return <section className="mt-7 border-t border-ramrod-foreground/15 pt-5" aria-labelledby="estate-mcp-context"><div className="flex items-center gap-2"><Wrench className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" /><h3 id="estate-mcp-context" className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">OPTIONAL MCP CONTEXT</h3></div><div className="mt-3 flex items-start gap-2"><StatusIcon status={status} /><p className="text-[10px] leading-relaxed text-ramrod-muted-foreground">{message}</p></div>{tools.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Discovered MCP tools">{tools.slice(0, 4).map((tool) => <span key={tool.name} title={tool.description} className="max-w-40 truncate border border-ramrod-foreground/15 px-1.5 py-1 text-[9px] font-medium text-ramrod-muted-foreground">{tool.name}</span>)}{tools.length > 4 && <span className="px-1 py-1 text-[9px] text-ramrod-muted-foreground">+{tools.length - 4}</span>}</div>}{(status === "failed" || status === "skipped") && <div className="mt-3 flex gap-2 text-[9px] leading-relaxed text-ramrod-muted-foreground"><CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>MCP context is never used as an official exhibit, finding, amount, or confidence input.</span></div>}</section>;
}