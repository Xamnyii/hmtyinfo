"use client";

import { Activity, Mic, Radio } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CfdiIntake } from "@/components/investigation/CfdiIntake";
import { EstateIntake } from "@/components/investigation/EstateIntake";
import {
  mockAgentStatus,
  mockMcpStatus,
  mockRecentInvestigations,
  type AgentStatus,
  type RiskLevel,
} from "./command-center-data";

const riskClasses: Record<RiskLevel, string> = {
  gray: "bg-ramrod-muted-foreground",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

function AgentState({ status }: { status: AgentStatus }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ramrod-primary opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-ramrod-primary" />
      </span>
      <span>AGENT {status}</span>
    </div>
  );
}

export function RamRod() {
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);

  const handleMicClick = () => {
    setIsListening((previousValue) => {
      const nextValue = !previousValue;
      toast(nextValue ? "Escuchando..." : "Micrófono desactivado");
      return nextValue;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return;

    toast(`Investigando: "${trimmedQuery}"`);
    setQuery("");
  };

  return (
    <div className="flex flex-1 flex-col px-5 pb-7 pt-4 sm:px-6 sm:pb-9">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-8 sm:gap-7 sm:py-10" aria-label="Centro de comando">
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className={`ramrod-orb-glow${isListening ? " ramrod-orb-glow-active" : ""}`} />
            <div className="ramrod-orb" data-tour="ai-agent" />
          </div>
          <AgentState status={mockAgentStatus} />
        </div>

        <button
          type="button"
          onClick={handleMicClick}
          aria-pressed={isListening}
          aria-label={isListening ? "Detener escucha" : "Activar micrófono"}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all${isListening ? " scale-110 bg-ramrod-primary text-ramrod-primary-foreground ring-4 ring-ramrod-primary/30" : " bg-ramrod-foreground/80 text-ramrod-card hover:bg-ramrod-foreground"}`}
        >
          <Mic className="h-6 w-6" />
        </button>

        <form onSubmit={handleSubmit} className="w-full max-w-xl" aria-label="Buscar o investigar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="text"
            placeholder="Investiga..."
            className="w-full rounded-full border border-ramrod-foreground/25 bg-ramrod-card/60 px-5 py-3 text-sm text-ramrod-foreground placeholder:text-ramrod-muted-foreground shadow-sm outline-none backdrop-blur transition-colors focus:border-ramrod-primary"
          />
        </form>

        <CfdiIntake />
        <EstateIntake />
      </section>

      <section className="mx-auto w-full max-w-4xl border-t border-ramrod-foreground/15 pt-4 sm:pt-5" aria-labelledby="recent-investigations">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="recent-investigations" className="text-[10px] font-bold tracking-[0.16em] text-ramrod-muted-foreground">
            RECENT INVESTIGATIONS
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-ramrod-primary">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{mockMcpStatus}</span>
          </div>
        </div>

        <div className="grid divide-y divide-ramrod-foreground/10 border-y border-ramrod-foreground/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {mockRecentInvestigations.map((investigation) => (
            <article key={investigation.caseId} className="group grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-0 py-3 transition-colors first:pt-3 hover:bg-ramrod-card/20 sm:px-4 sm:py-4">
              <span className={`mt-1.5 h-2 w-2 rounded-full ${riskClasses[investigation.risk]}`} aria-label={`Riesgo ${investigation.risk}`} />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[10px] font-bold tracking-[0.12em] text-ramrod-primary">{investigation.caseId}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-ramrod-muted-foreground">{investigation.amount}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-ramrod-foreground">{investigation.company}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.1em] text-ramrod-muted-foreground">
                  <Activity className="h-3 w-3 text-ramrod-primary" aria-hidden="true" />
                  <span>{investigation.status}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}