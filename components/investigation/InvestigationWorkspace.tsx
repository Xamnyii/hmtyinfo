"use client";

import { ArrowLeft, Check, ChevronDown, ChevronUp, Circle, FileWarning, LoaderCircle, Search, Send } from "lucide-react";
import { useParams } from "next/navigation";
import { useTransitionRouter } from "next-transition-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { readActiveCaseDraft, saveActiveCaseDraft } from "./case-draft-storage";
import { McpActivityPanel } from "./McpActivityPanel";
import { deterministicInvestigationReasoner, runInvestigationAgent } from "./investigationAgent";
import type { CfdiConcept, InvestigationAgentState, InvestigationCaseDraft, InvestigationPhase, ParsedCfdi, RiskLevel, SignalSeverity, UploadedXmlFile, XmlFileStatus } from "./cfdi-types";

type DraftState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; draft: InvestigationCaseDraft };

type StepState = "complete" | "current" | "upcoming";

const phaseOrder: InvestigationPhase[] = [
  "NOT_STARTED",
  "ANALYZING_SOURCE",
  "IDENTIFYING_ENTITIES",
  "CHECKING_SIGNALS",
  "QUERYING_TOOLS",
  "FOLLOWING_RELATIONSHIPS",
  "BUILDING_EVIDENCE",
  "ASSESSING_RISK",
  "WAITING_FOR_HUMAN",
  "COMPLETED",
];

const riskClasses: Record<RiskLevel, string> = {
  gray: "text-ramrod-muted-foreground",
  orange: "text-orange-500",
  red: "text-red-500",
};

function getStepState(agent: InvestigationAgentState | undefined, targetPhase: InvestigationPhase): StepState {
  if (!agent) return targetPhase === "ANALYZING_SOURCE" ? "current" : "upcoming";
  if (agent.phase === "WAITING_FOR_HUMAN" || agent.phase === "COMPLETED") return "complete";
  const currentIndex = phaseOrder.indexOf(agent.phase);
  const targetIndex = phaseOrder.indexOf(targetPhase);
  if (currentIndex > targetIndex) return "complete";
  return currentIndex === targetIndex ? "current" : "upcoming";
}

function getInvestigationSteps(draft: InvestigationCaseDraft): Array<{ label: string; state: StepState }> {
  const agent = draft.agent;
  return [
    { label: "XML analyzed", state: getStepState(agent, "ANALYZING_SOURCE") },
    { label: `${draft.metrics.uniqueEntities} entities identified`, state: getStepState(agent, "IDENTIFYING_ENTITIES") },
    { label: `${draft.metrics.signalCount} signals detected`, state: getStepState(agent, "CHECKING_SIGNALS") },
    { label: "MCP tool discovery", state: getStepState(agent, "QUERYING_TOOLS") },
    { label: "Billing relationships reviewed", state: getStepState(agent, "FOLLOWING_RELATIONSHIPS") },
    { label: "Evidence assessment", state: getStepState(agent, "BUILDING_EVIDENCE") },
    { label: "Preliminary risk assessment", state: getStepState(agent, "ASSESSING_RISK") },
  ];
}

function formatAmount(amount: number | undefined, currency?: string): string {
  if (typeof amount !== "number") return "No disponible";
  if (!currency) return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(amount);

  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }
}

function displayValue(value: string | undefined): string {
  return value || "No disponible";
}

function formatDate(value: string | undefined): string {
  if (!value) return "No disponible";

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function FileStatus({ status }: { status: XmlFileStatus }) {
  if (status === "parsed") return <Check className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" />;
  if (status === "error") return <FileWarning className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />;
  if (status === "uploading" || status === "analyzing") return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-ramrod-primary" aria-hidden="true" />;
  return <Circle className="h-3.5 w-3.5 text-ramrod-muted-foreground" aria-hidden="true" />;
}

const signalSeverityClasses: Record<SignalSeverity, string> = {
  INFO: "text-ramrod-muted-foreground",
  LOW: "text-ramrod-primary",
  MEDIUM: "text-orange-500",
  HIGH: "text-red-500",
};

function formatCurrencyTotals(totals: Record<string, number>): string {
  const values = Object.entries(totals).map(([currency, amount]) => formatAmount(amount, currency));
  return values.join(" · ") || "No disponible";
}

function phaseLabel(phase: InvestigationPhase | undefined): string {
  if (phase === "WAITING_FOR_HUMAN") return "WAITING FOR HUMAN";
  if (phase === "COMPLETED") return "INVESTIGATION READY";
  return "INVESTIGATING";
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-xs font-medium text-ramrod-foreground">{value}</dd>
    </div>
  );
}

function InvoiceDetail({ invoice }: { invoice: ParsedCfdi }) {
  const [showAllConcepts, setShowAllConcepts] = useState(false);
  const concepts = showAllConcepts ? invoice.concepts : invoice.concepts.slice(0, 3);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-primary">GENERAL</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <DataPoint label="UUID" value={displayValue(invoice.uuid)} />
          <DataPoint label="SERIE / FOLIO" value={[invoice.series, invoice.folio].filter(Boolean).join(" / ") || "No disponible"} />
          <DataPoint label="FECHA" value={formatDate(invoice.date)} />
          <DataPoint label="TIPO" value={displayValue(invoice.voucherType)} />
        </dl>
      </section>

      <section className="border-t border-ramrod-foreground/12 pt-5">
        <h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-primary">EMISOR</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <DataPoint label="NOMBRE" value={displayValue(invoice.issuer.name)} />
          <DataPoint label="RFC" value={displayValue(invoice.issuer.rfc)} />
          <DataPoint label="RÉGIMEN FISCAL" value={displayValue(invoice.issuer.taxRegime)} />
        </dl>
      </section>

      <section className="border-t border-ramrod-foreground/12 pt-5">
        <h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-primary">RECEPTOR</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <DataPoint label="NOMBRE" value={displayValue(invoice.receiver.name)} />
          <DataPoint label="RFC" value={displayValue(invoice.receiver.rfc)} />
          <DataPoint label="RÉGIMEN FISCAL" value={displayValue(invoice.receiver.taxRegime)} />
          <DataPoint label="USO CFDI" value={displayValue(invoice.receiver.cfdiUse)} />
          <DataPoint label="DOMICILIO FISCAL" value={displayValue(invoice.receiver.fiscalAddress)} />
        </dl>
      </section>

      <section className="border-t border-ramrod-foreground/12 pt-5">
        <h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-primary">MONTOS</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <DataPoint label="SUBTOTAL" value={formatAmount(invoice.subtotal, invoice.currency)} />
          <DataPoint label="TOTAL" value={formatAmount(invoice.total, invoice.currency)} />
          <DataPoint label="MONEDA" value={displayValue(invoice.currency)} />
          <DataPoint label="FORMA DE PAGO" value={displayValue(invoice.paymentForm)} />
          <DataPoint label="MÉTODO DE PAGO" value={displayValue(invoice.paymentMethod)} />
        </dl>
      </section>

      <section className="border-t border-ramrod-foreground/12 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-primary">CONCEPTOS</h3>
          {invoice.concepts.length > 3 && (
            <button type="button" onClick={() => setShowAllConcepts((showing) => !showing)} className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.1em] text-ramrod-primary hover:text-ramrod-foreground">
              {showAllConcepts ? "VER MENOS" : "VER TODOS"}
              {showAllConcepts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        {concepts.length > 0 ? (
          <ul className="mt-3 divide-y divide-ramrod-foreground/10 border-y border-ramrod-foreground/10">
            {concepts.map((concept: CfdiConcept, index) => (
              <li key={`${concept.productServiceKey ?? "concept"}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <div className="min-w-0"><p className="truncate text-xs font-semibold text-ramrod-foreground">{displayValue(concept.description)}</p><p className="mt-1 text-[10px] text-ramrod-muted-foreground">Cantidad: {concept.quantity ?? "No disponible"}{concept.productServiceKey ? ` · ${concept.productServiceKey}` : ""}</p></div>
                <span className="text-xs font-bold text-ramrod-foreground">{formatAmount(concept.amount, invoice.currency)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-xs text-ramrod-muted-foreground">No hay conceptos disponibles en este XML.</p>}
      </section>
    </div>
  );
}

function SourceFileList({ files, selectedFileId, onSelect }: { files: UploadedXmlFile[]; selectedFileId: string | null; onSelect: (fileId: string) => void }) {
  return (
    <ul className="mt-3 divide-y divide-ramrod-foreground/10 border-y border-ramrod-foreground/10">
      {files.map((file) => {
        const isSelectable = file.status === "parsed" && Boolean(file.parsed);
        const isSelected = file.id === selectedFileId;
        return (
          <li key={file.id}>
            <button type="button" disabled={!isSelectable} onClick={() => onSelect(file.id)} className={`flex w-full items-center gap-2 px-1 py-3 text-left transition-colors${isSelected ? " bg-ramrod-primary/10" : " hover:bg-ramrod-card/30"}${isSelectable ? "" : " cursor-default opacity-65"}`}>
              <FileStatus status={file.status} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ramrod-foreground">{file.name}</span>
              <span className={`text-[9px] font-bold tracking-[0.1em]${file.status === "error" ? " text-red-500" : file.status === "parsed" ? " text-ramrod-primary" : " text-ramrod-muted-foreground"}`}>{file.status.toUpperCase()}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function InvestigationWorkspace() {
  const router = useTransitionRouter();
  const params = useParams<{ id?: string }>();
  const caseId = params.id ?? "";
  const [draftState, setDraftState] = useState<DraftState>({ status: "loading" });
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const startedCaseIdRef = useRef<string | null>(null);

  useEffect(() => {
    const draft = readActiveCaseDraft();
    if (!draft || draft.caseId !== caseId) {
      setDraftState({ status: "missing" });
      return;
    }

    setSelectedFileId(draft.sourceFiles.find((file) => file.status === "parsed" && file.parsed)?.id ?? null);
    setDraftState({ status: "ready", draft });
  }, [caseId]);

  const readyCaseId = draftState.status === "ready" ? draftState.draft.caseId : null;

  useEffect(() => {
    if (draftState.status !== "ready" || draftState.draft.agent?.completedAt || startedCaseIdRef.current === draftState.draft.caseId) return;

    startedCaseIdRef.current = draftState.draft.caseId;
    void runInvestigationAgent(draftState.draft, (agent, evidence, financialTransactions) => {
      setDraftState((currentState) => {
        if (currentState.status !== "ready" || currentState.draft.caseId !== draftState.draft.caseId) return currentState;
        const nextDraft = { ...currentState.draft, agent, evidence, financialTransactions };
        saveActiveCaseDraft(nextDraft);
        return { status: "ready", draft: nextDraft };
      });
    });
  }, [draftState, readyCaseId]);

  if (draftState.status === "loading") {
    return <div className="flex flex-1 items-center justify-center px-6 text-xs font-bold tracking-[0.14em] text-ramrod-muted-foreground">ABRIENDO INVESTIGACIÓN</div>;
  }

  if (draftState.status === "missing") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <section className="w-full max-w-md border border-ramrod-foreground/20 bg-ramrod-card/45 p-6 text-center backdrop-blur sm:p-8">
          <Search className="mx-auto h-6 w-6 text-ramrod-primary" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-ramrod-foreground">No se encontró información para esta investigación.</h2>
          <p className="mt-2 text-sm text-ramrod-muted-foreground">El caso temporal ya no está disponible en esta sesión.</p>
          <button type="button" onClick={() => router.push("/mainpage")} className="mt-6 inline-flex items-center gap-2 border border-ramrod-primary bg-ramrod-primary px-4 py-2.5 text-[10px] font-bold tracking-[0.12em] text-ramrod-primary-foreground hover:bg-ramrod-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            VOLVER A RAMROD
          </button>
        </section>
      </div>
    );
  }

  const { draft } = draftState;
  const primaryCompany = draft.entities[0] ?? draft.detectedCompanies[0];
  const selectedFile = draft.sourceFiles.find((file) => file.id === selectedFileId);
  const steps = getInvestigationSteps(draft);
  const agent = draft.agent;
  const riskAssessment = agent?.riskAssessment;
  const financialTransactionCount = draft.financialTransactions?.length ?? 0;

  const handleQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    setAnswer(deterministicInvestigationReasoner.answerQuestion(draft, trimmedQuestion));
    setQuestion("");
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-8 pt-4 sm:px-6 sm:pb-10">
      <header className="border-b border-ramrod-foreground/15 pb-5">
        <button type="button" onClick={() => router.push("/mainpage")} className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-ramrod-muted-foreground transition-colors hover:text-ramrod-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          RAMROD
        </button>
        <div className="mt-4 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="text-xl font-extrabold text-ramrod-foreground sm:text-2xl">{draft.caseId}</h2>
              <span className="border border-ramrod-primary/40 bg-ramrod-primary/10 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ramrod-primary">{phaseLabel(agent?.phase)}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-ramrod-foreground">{primaryCompany?.name || primaryCompany?.rfc || "Empresa no disponible"}</p>
            <p className="mt-1 text-xs text-ramrod-muted-foreground">RFC: {primaryCompany?.rfc || "No disponible"}{draft.metrics.uniqueEntities > 1 ? ` · + ${draft.metrics.uniqueEntities - 1} entidades` : ""}</p>
          </div>
          <dl className="grid grid-cols-3 gap-x-5 border-l border-ramrod-foreground/15 pl-4 sm:gap-x-8">
            <DataPoint label="TOTAL FACTURADO" value={formatCurrencyTotals(draft.metrics.totalAmountByCurrency)} />
            <DataPoint label="FACTURAS" value={String(draft.metrics.invoiceCount)} />
            <DataPoint label="ENTIDADES" value={String(draft.metrics.uniqueEntities)} />
          </dl>
        </div>
      </header>

      <div className="grid flex-1 gap-6 py-6 xl:grid-cols-[minmax(190px,0.7fr)_minmax(0,2fr)_minmax(230px,0.85fr)] xl:gap-8">
        <aside className="order-2 border-t border-ramrod-foreground/15 pt-5 xl:order-1 xl:border-t-0 xl:border-r xl:pr-6 xl:pt-0">
          <h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">RAMROD PROGRESS</h3>
          <ol className="mt-4 space-y-3">
            {steps.map((step) => (
              <li key={step.label} className={`flex items-center gap-2 text-xs${step.state === "upcoming" ? " text-ramrod-muted-foreground" : " text-ramrod-foreground"}`}>
                {step.state === "complete" ? <Check className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" /> : step.state === "current" ? <span className="h-2 w-2 rounded-full bg-ramrod-primary shadow-[0_0_0_4px_hsl(var(--ramrod-primary)/0.15)]" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className={step.state === "current" ? "font-bold" : undefined}>{step.label}</span>
              </li>
            ))}
          </ol>
          {draft.signals.length > 0 && (
            <section className="mt-7 border-t border-ramrod-foreground/15 pt-5" aria-labelledby="analysis-signals">
              <div className="flex items-center justify-between gap-3"><h3 id="analysis-signals" className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">ANALYSIS SIGNALS</h3><span className="text-[10px] font-bold text-ramrod-primary">{draft.metrics.signalCount}</span></div>
              <ul className="mt-3 space-y-3">
                {draft.signals.slice(0, 3).map((signal) => (
                  <li key={signal.signalId} className="border-l border-ramrod-foreground/20 pl-3">
                    <div className="flex items-baseline justify-between gap-2"><span className={`text-[9px] font-bold tracking-[0.12em] ${signalSeverityClasses[signal.severity]}`}>{signal.severity}</span><span className="text-[9px] text-ramrod-muted-foreground">{signal.signalId}</span></div>
                    <p className="mt-1 text-xs font-semibold text-ramrod-foreground">{signal.title}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{signal.description}</p>
                    {signal.evidenceIds.length > 0 && <p className="mt-1 text-[9px] font-bold tracking-[0.1em] text-ramrod-primary">{signal.evidenceIds.join(" · ")}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <section className="order-1 min-w-0 xl:order-2" aria-labelledby="invoice-detail-title">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold tracking-[0.14em] text-ramrod-primary">EXTRACTED CFDI DATA</p><h3 id="invoice-detail-title" className="mt-1 text-base font-bold text-ramrod-foreground">{selectedFile?.name || "Selecciona un archivo"}</h3></div>
            {selectedFile?.parsed?.uuid && <span className="hidden max-w-40 truncate text-[10px] text-ramrod-muted-foreground sm:block">{selectedFile.parsed.uuid}</span>}
          </div>
          {selectedFile?.parsed ? <InvoiceDetail invoice={selectedFile.parsed} /> : <div className="border border-dashed border-ramrod-foreground/25 px-5 py-12 text-center text-sm text-ramrod-muted-foreground">Selecciona un XML procesado para revisar sus datos extraídos.</div>}

          <section className="mt-8 border-t border-ramrod-foreground/15 pt-5" data-tour="evidence-trail" aria-labelledby="investigation-summary-title">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] text-ramrod-primary">INVESTIGATION FINDINGS</p>
                <h3 id="investigation-summary-title" className="mt-1 text-base font-bold text-ramrod-foreground">Evidencia y evaluación preliminar</h3>
              </div>
              {riskAssessment && <span className={`text-[10px] font-bold tracking-[0.12em] ${riskClasses[riskAssessment.level]}`}>PRELIMINARY RISK · {riskAssessment.level.toUpperCase()}</span>}
            </div>

            <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                {agent?.findings.length ? (
                  <ul className="space-y-3">
                    {agent.findings.slice(0, 3).map((finding) => (
                      <li key={finding.findingId} className="border-l border-ramrod-foreground/20 pl-3">
                        <p className="text-[9px] font-bold tracking-[0.12em] text-ramrod-primary">{finding.findingId} · {finding.status.toUpperCase()}</p>
                        <p className="mt-1 text-xs font-semibold text-ramrod-foreground">{finding.title}</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{finding.description}</p>
                        <p className="mt-1 text-[9px] font-bold tracking-[0.1em] text-ramrod-primary">{finding.evidenceIds.join(" · ")}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-ramrod-muted-foreground">No hay findings respaldados por evidencia adicional.</p>}

                {agent?.hypotheses.length ? (
                  <div className="mt-5 border-t border-ramrod-foreground/12 pt-4">
                    <p className="text-[10px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">HYPOTHESIS</p>
                    {agent.hypotheses.map((hypothesis) => (
                      <div key={hypothesis.hypothesisId} className="mt-2">
                        <p className="text-xs font-semibold text-ramrod-foreground">{hypothesis.hypothesisId} · {hypothesis.title}</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{hypothesis.description}</p>
                        <p className="mt-1 text-[9px] font-bold tracking-[0.1em] text-ramrod-primary">{hypothesis.supportingEvidenceIds.join(" · ")}</p>
                        {hypothesis.contradictoryEvidenceIds.length > 0 && <p className="mt-1 text-[9px] font-bold tracking-[0.1em] text-orange-500">CONTRADICTS · {hypothesis.contradictoryEvidenceIds.join(" · ")}</p>}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {riskAssessment && (
                <dl className="grid grid-cols-3 gap-x-4 border-t border-ramrod-foreground/12 pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                  <DataPoint label="RISK" value={`${riskAssessment.score}/100`} />
                  <DataPoint label="CONFIDENCE" value={`${riskAssessment.confidence}%`} />
                  <DataPoint label="COVERAGE" value={`${riskAssessment.evidenceCoverage}%`} />
                </dl>
              )}
            </div>

            <div className="mt-5 border-t border-ramrod-foreground/12 pt-4" data-tour="money-flow">
              <p className="text-[10px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">CFDI RELATIONSHIPS</p>
              <p className="mt-1 text-xs text-ramrod-foreground">{draft.relationships.length} relaciones de facturación declaradas en CFDI.</p>
              <p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{financialTransactionCount > 0 ? `${financialTransactionCount} transacciones financieras verificadas por una herramienta MCP.` : "No hay datos de transacciones financieras verificadas en este caso."}</p>
            </div>
          </section>
        </section>

        <aside className="order-3 border-t border-ramrod-foreground/15 pt-5 xl:border-l xl:pl-6 xl:pt-0">
          <h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">SOURCE FILES</h3>
          <SourceFileList files={draft.sourceFiles} selectedFileId={selectedFileId} onSelect={setSelectedFileId} />
          {draft.evidence.length > 0 && (
            <section className="mt-6 border-t border-ramrod-foreground/15 pt-5" aria-labelledby="analysis-evidence">
              <h3 id="analysis-evidence" className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">EVIDENCE</h3>
              <ul className="mt-3 space-y-3">
                {draft.evidence.slice(0, 3).map((evidence) => (
                  <li key={evidence.evidenceId}>
                    <p className="text-[9px] font-bold tracking-[0.12em] text-ramrod-primary">{evidence.evidenceId}{evidence.invoiceId ? ` · ${evidence.invoiceId}` : ""}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{evidence.description || evidence.fact || "Evidencia disponible para revisión."}</p>
                    <p className="mt-1 text-[9px] font-medium text-ramrod-muted-foreground">{evidence.sourceTool || evidence.source}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {agent && <div className="mt-6"><McpActivityPanel status={agent.mcpStatus} tools={agent.availableTools} executions={agent.toolExecutions} decisions={agent.decisions} /></div>}
          {agent?.discardedLeads.length ? (
            <section className="mt-6 border-t border-ramrod-foreground/15 pt-5" aria-labelledby="discarded-leads">
              <h3 id="discarded-leads" className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">DISCARDED LEADS</h3>
              {agent.discardedLeads.map((lead) => (
                <div key={lead.leadId} className="mt-3 border-l border-ramrod-foreground/20 pl-3">
                  <p className="text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">{lead.leadId} · DISCARDED</p>
                  <p className="mt-1 text-xs font-semibold text-ramrod-foreground">{lead.description}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{lead.reason}</p>
                </div>
              ))}
            </section>
          ) : null}
          <p className="mt-5 text-[10px] leading-relaxed text-ramrod-muted-foreground">Los XML fueron procesados por el analizador CFDI. Las señales describen patrones observados, no conclusiones de fraude.</p>
        </aside>
      </div>

      <section className="border-t border-ramrod-foreground/15 pt-5" aria-labelledby="ask-ramrod-title">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="ask-ramrod-title" className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">ASK RAMROD</h3>
          <span className="text-[9px] font-medium text-ramrod-muted-foreground">Evidence-grounded response</span>
        </div>
        <form onSubmit={handleQuestion} className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="¿Por qué marcaste esta empresa?"
            className="min-w-0 flex-1 border border-ramrod-foreground/20 bg-ramrod-card/45 px-4 py-3 text-sm text-ramrod-foreground placeholder:text-ramrod-muted-foreground outline-none transition-colors focus:border-ramrod-primary"
          />
          <button type="submit" aria-label="Preguntar a RamRod" className="flex h-11 w-11 shrink-0 items-center justify-center border border-ramrod-primary bg-ramrod-primary text-ramrod-primary-foreground transition-colors hover:bg-ramrod-foreground">
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        {answer && <p className="mt-3 border-l border-ramrod-primary pl-3 text-xs leading-relaxed text-ramrod-foreground">{answer}</p>}
        {agent?.timeline.length ? (
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-ramrod-foreground/12 pt-4" aria-label="Registro de auditoría">
            {agent.timeline.slice(-4).reverse().map((event) => (
              <span key={event.eventId} className="text-[10px] text-ramrod-muted-foreground">
                {new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.at))} · {event.message}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
