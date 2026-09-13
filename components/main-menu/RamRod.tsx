"use client";

import { Activity, Bot, Mic, Radio, Send } from "lucide-react";
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

type AgentMessage = {
  role: "user" | "agent";
  content: string;
};

function answerCommandCenterQuestion(question: string): string {
  const normalized = question.toLowerCase();

  if (/xml|factura|cfdi/.test(normalized)) {
    return "Sube uno o varios XML en el bloque de facturas. Si el servicio Python no está disponible, puedo hacer un análisis local básico en el navegador y abrir una investigación con entidades, evidencia y señales.";
  }
  if (/estate|zip|sqlite|db|forense/.test(normalized)) {
    return "Para estate necesito el archivo .zip, .db, .sqlite o .sqlite3. Ese análisis sí usa el servicio forense Python; si no está corriendo, te voy a mostrar un error claro en vez de quedarme en silencio.";
  }
  if (/mcp|herramienta|conexion|extern/.test(normalized)) {
    return "Las conexiones externas pasan por MCP. Si MCP_SERVER_URL no está configurado, la investigación sigue con evidencia local y marca esas herramientas como no disponibles.";
  }
  if (/riesgo|fraude|alerta|señal|senal/.test(normalized)) {
    return "Puedo explicar señales como UUID duplicado, emisor y receptor iguales, falta de timbre fiscal y relaciones de facturación. La clasificación es preliminar: describe patrones, no acusa fraude por sí sola.";
  }

  return "Estoy listo para investigar. Para resultados reales, sube XML CFDI o un estate; desde ahí genero un caso, ejecuto el flujo de análisis y respondo preguntas con base en la evidencia encontrada.";
}

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
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(mockAgentStatus);
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      role: "agent",
      content: "RamRod listo. Sube CFDI XML para analizar facturas o pregúntame qué conexión necesitas revisar.",
    },
  ]);

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

    setAgentStatus("ANALYZING");
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: trimmedQuery },
      { role: "agent", content: answerCommandCenterQuestion(trimmedQuery) },
    ]);
    toast("RamRod respondió en el centro de comando.");
    setQuery("");
    window.setTimeout(() => setAgentStatus("IDLE"), 350);
  };

  return (
    <div className="flex flex-1 flex-col px-5 pb-7 pt-4 sm:px-6 sm:pb-9">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-8 sm:gap-7 sm:py-10" aria-label="Centro de comando">
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className={`ramrod-orb-glow${isListening ? " ramrod-orb-glow-active" : ""}`} />
            <div className="ramrod-orb" data-tour="ai-agent" />
          </div>
          <AgentState status={agentStatus} />
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
          <div className="flex rounded-full border border-ramrod-foreground/25 bg-ramrod-card/60 shadow-sm backdrop-blur transition-colors focus-within:border-ramrod-primary">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="text"
              placeholder="Investiga..."
              className="min-w-0 flex-1 rounded-full bg-transparent px-5 py-3 text-sm text-ramrod-foreground placeholder:text-ramrod-muted-foreground outline-none"
            />
            <button type="submit" aria-label="Enviar pregunta a RamRod" className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-ramrod-primary transition-colors hover:bg-ramrod-primary/10">
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>

        <section className="w-full max-w-xl border-y border-ramrod-foreground/10 py-3" aria-label="Respuesta del agente RamRod">
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" />
            <span>COMMAND CENTER AGENT</span>
          </div>
          <div className="mt-3 max-h-36 space-y-2 overflow-auto pr-1">
            {messages.slice(-4).map((message, index) => (
              <p key={`${message.role}-${index}-${message.content}`} className={`text-xs leading-relaxed ${message.role === "agent" ? "text-ramrod-foreground" : "text-ramrod-muted-foreground"}`}>
                <span className="font-bold text-ramrod-primary">{message.role === "agent" ? "RamRod" : "Tú"}:</span> {message.content}
              </p>
            ))}
          </div>
        </section>

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
