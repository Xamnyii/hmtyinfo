"use client";

import { ArrowLeft, CheckCircle2, CircleAlert, Download, ExternalLink, FileCheck2, FileText, ListChecks, Network, Printer, Search, ShieldCheck, Wrench } from "lucide-react";
import { useParams } from "next/navigation";
import { useTransitionRouter } from "next-transition-router";
import { useEffect, useState, type FormEvent } from "react";
import { EstateMcpContextPanel } from "./EstateMcpContextPanel";
import { readForensicRun, type StoredForensicRun } from "./estate-run-storage";
import type { ForensicFinding, ForensicRunBundle } from "./forensic-run-types";

type WorkspaceState = { status: "loading" } | { status: "missing" } | { status: "ready"; run: StoredForensicRun };
type View = "analysis" | "evidence" | "money-trail" | "declined" | "case-file" | "audit-log";

const views: Array<{ id: View; label: string; icon: typeof Search }> = [
  { id: "analysis", label: "Analysis", icon: Search },
  { id: "evidence", label: "Evidence", icon: ShieldCheck },
  { id: "money-trail", label: "Money Trail", icon: Network },
  { id: "declined", label: "Declined Leads", icon: CircleAlert },
  { id: "case-file", label: "Case File", icon: FileText },
  { id: "audit-log", label: "Audit Log", icon: ListChecks },
];

function money(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(value);
}

function localTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function downloadFile(name: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function answerCaseQuestion(bundle: ForensicRunBundle, question: string): string {
  const normalized = question.toLocaleLowerCase("en-US");
  const findingMatch = bundle.findings.find((finding) => normalized.includes(finding.findingId.toLowerCase()) || finding.entities.some((entity) => normalized.includes(entity.toLowerCase())));
  const closedMatch = bundle.declinedLeads.find((lead) => normalized.includes(lead.entity.toLowerCase()) || normalized.includes(lead.leadId.toLowerCase()));
  if (/why.*flag|por qu[eé].*(flag|marc)|why.*finding/.test(normalized) && findingMatch) {
    return `${findingMatch.findingId} se validó como ${findingMatch.confidence}: ${findingMatch.narrative} Exhibits: ${findingMatch.exhibits.map((exhibit) => exhibit.exhibitId).join(", ")}. ${findingMatch.challengerReview.reason}`;
  }
  if (/why.*not|por qu[eé].*(no|descart)|not.*flag/.test(normalized) && closedMatch) {
    return `${closedMatch.leadId} para ${closedMatch.entity} fue cerrado por ${closedMatch.closedBy}. ${closedMatch.reason} Tools: ${closedMatch.toolCallsMade.join(", ") || "none"}.`;
  }
  if (/confiden|confianza/.test(normalized) && findingMatch) {
    return `${findingMatch.findingId} tiene confianza oficial ${findingMatch.confidence}. El Validator verificó ${findingMatch.exhibits.length} exhibits y la reconciliación: ${findingMatch.reconciliation.explanation}`;
  }
  if (/amount|monto|peso|trust.*number|confiar.*monto/.test(normalized) && findingMatch) {
    return `${findingMatch.findingId}: ${money(findingMatch.pesoAmount)}. ${findingMatch.reconciliation.explanation}`;
  }
  if (/contradict|contradic|challenger/.test(normalized) && findingMatch) {
    return `Challenger revisó: ${findingMatch.challengerReview.alternativeExplanation} Resultado: ${findingMatch.challengerReview.reason}`;
  }
  if (/tool|herramienta|called/.test(normalized)) {
    return bundle.toolLog.length ? `Tools locales ejecutadas: ${Array.from(new Set(bundle.toolLog.map((item) => item.tool))).join(", ")}. Todas las ejecuciones se conservan en Audit Log.` : "No se registraron herramientas para esta corrida.";
  }
  if (/change|cambia|input/.test(normalized)) {
    return "Un cambio al estate cambia el input digest y requiere una corrida nueva. RamRod no modifica findings existentes para responder preguntas.";
  }
  if (closedMatch) return `${closedMatch.leadId}: ${closedMatch.reason}`;
  if (findingMatch) return `${findingMatch.findingId}: ${findingMatch.narrative}`;
  return `La corrida contiene ${bundle.findings.length} finding(s), ${bundle.declinedLeads.length} lead(s) cerrado(s), ${bundle.evidence.length} evidence item(s) y validación ${bundle.submissionValidation.status}.`;
}

function SummaryPoint({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-bold text-ramrod-foreground">{value}</dd></div>;
}

function FindingList({ findings, onSelectTrail }: { findings: ForensicFinding[]; onSelectTrail: () => void }) {
  if (findings.length === 0) return <p className="border-l border-ramrod-primary pl-3 text-sm leading-relaxed text-ramrod-foreground">No validated findings met the evidence threshold.</p>;
  return <div className="divide-y divide-ramrod-foreground/12 border-y border-ramrod-foreground/12">{findings.map((finding) => <article key={finding.findingId} className="py-5 first:pt-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[10px] font-bold tracking-[0.12em] text-ramrod-primary">{finding.findingId} · {finding.schemeType.toUpperCase()}</p><span className="text-[10px] font-bold tracking-[0.12em] text-ramrod-foreground">{finding.confidence.toUpperCase()} · {money(finding.pesoAmount)}</span></div><p className="mt-2 text-sm font-semibold text-ramrod-foreground">{finding.entities.join(" · ")}</p><p className="mt-2 text-xs leading-relaxed text-ramrod-muted-foreground">{finding.narrative}</p><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-ramrod-muted-foreground"><span>{finding.exhibits.length} exhibits</span><span>{finding.reconciliation.passes ? "AMOUNT RECONCILES" : "AMOUNT CHECK FAILED"}</span>{finding.moneyTrail.length > 0 && <button type="button" onClick={onSelectTrail} className="font-bold tracking-[0.1em] text-ramrod-primary hover:text-ramrod-foreground">VIEW MONEY TRAIL</button>}</div></article>)}</div>;
}

function EvidenceView({ bundle }: { bundle: ForensicRunBundle }) {
  return <div className="divide-y divide-ramrod-foreground/12 border-y border-ramrod-foreground/12">{bundle.evidence.map((evidence) => <article key={evidence.evidenceId} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="text-[10px] font-bold tracking-[0.12em] text-ramrod-primary">{evidence.evidenceId} · {evidence.sourceTable.toUpperCase()} · {evidence.recordId}</p><p className="mt-1 text-xs font-semibold text-ramrod-foreground">{evidence.description}</p><p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">Proves: {evidence.whatItProves}</p><p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">Does not prove: {evidence.whatItDoesNotProve}</p></div><div className="text-left sm:text-right"><p className="text-[10px] font-bold text-ramrod-foreground">{evidence.amount === null ? "NO AMOUNT" : money(evidence.amount)}</p><p className="mt-1 text-[9px] font-medium text-ramrod-muted-foreground">{evidence.tool}</p></div></article>)}</div>;
}

function MoneyTrailView({ findings }: { findings: ForensicFinding[] }) {
  const trailFindings = findings.filter((finding) => finding.moneyTrail.length > 0);
  if (trailFindings.length === 0) return <p className="border-l border-ramrod-foreground/20 pl-3 text-sm leading-relaxed text-ramrod-muted-foreground">No validated financial money trail is available. Billing relationships are not displayed as bank transfers.</p>;
  return <div className="space-y-7" data-tour="money-flow">{trailFindings.map((finding) => <section key={finding.findingId}><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-bold text-ramrod-foreground">{finding.findingId} · {finding.schemeType}</h3><span className="text-[10px] font-bold tracking-[0.1em] text-ramrod-primary">{money(finding.pesoAmount)}</span></div><ol className="mt-3 grid gap-2 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">{finding.moneyTrail.map((step, index) => <li key={`${step.exhibitId}-${index}`} className="border border-ramrod-foreground/18 bg-ramrod-card/35 p-3"><p className="truncate text-[10px] font-bold text-ramrod-foreground" title={step.fromEntity}>{step.fromEntity}</p><p className="my-1 text-[10px] font-bold text-ramrod-primary">↓ {money(step.amount)} · {step.exhibitId}</p><p className="truncate text-[10px] font-bold text-ramrod-foreground" title={step.toEntity}>{step.toEntity}</p><p className="mt-2 text-[9px] text-ramrod-muted-foreground">{step.date}</p></li>)}</ol></section>)}</div>;
}

function DeclinedLeadsView({ bundle }: { bundle: ForensicRunBundle }) {
  if (bundle.declinedLeads.length === 0) return <p className="text-sm text-ramrod-muted-foreground">No leads were closed in this run.</p>;
  return <div className="space-y-4">{bundle.declinedLeads.map((lead) => <article key={lead.leadId} className="border-l-2 border-ramrod-foreground/25 pl-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[10px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">{lead.leadId} · CLOSED · {lead.closedBy.toUpperCase()}</p><p className="text-[10px] font-bold tracking-[0.1em] text-ramrod-primary">{lead.signal}</p></div><h3 className="mt-1 text-sm font-bold text-ramrod-foreground">{lead.entity}</h3><p className="mt-2 text-xs leading-relaxed text-ramrod-muted-foreground">{lead.reason}</p><p className="mt-2 text-[10px] leading-relaxed text-ramrod-muted-foreground">Evidence examined: {lead.evidenceIds.join(" · ") || "No additional evidence IDs"}</p><p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">Tools used: {lead.toolCallsMade.join(" · ") || "No tool call"}</p></article>)}</div>;
}

function CaseFileView({ run }: { run: StoredForensicRun }) {
  const bundleText = JSON.stringify(run.bundle, null, 2);
  const submissionText = JSON.stringify(run.bundle.submission, null, 2);
  const caseFile = run.caseFileHtml || run.bundle.caseFileHtml;
  const openCaseFile = () => {
    if (!caseFile) return;
    const url = URL.createObjectURL(new Blob([caseFile], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const printCaseFile = () => {
    if (!caseFile) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    printWindow.document.write(caseFile);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
  return <div><div className="flex flex-wrap gap-2"><button type="button" disabled={run.bundle.submissionValidation.status !== "PASS"} onClick={() => downloadFile("submission.json", submissionText, "application/json")} className="inline-flex items-center gap-2 border border-ramrod-primary bg-ramrod-primary px-3 py-2 text-[10px] font-bold tracking-[0.1em] text-ramrod-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" aria-hidden="true" />DOWNLOAD SUBMISSION</button><button type="button" onClick={() => downloadFile("run_bundle.json", bundleText, "application/json")} className="inline-flex items-center gap-2 border border-ramrod-foreground/20 px-3 py-2 text-[10px] font-bold tracking-[0.1em] text-ramrod-foreground"><Download className="h-3.5 w-3.5" aria-hidden="true" />DOWNLOAD RUN BUNDLE</button><button type="button" disabled={!caseFile} onClick={openCaseFile} className="inline-flex items-center gap-2 border border-ramrod-foreground/20 px-3 py-2 text-[10px] font-bold tracking-[0.1em] text-ramrod-foreground disabled:opacity-50"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />OPEN CASE FILE</button><button type="button" disabled={!caseFile} onClick={printCaseFile} className="inline-flex items-center gap-2 border border-ramrod-foreground/20 px-3 py-2 text-[10px] font-bold tracking-[0.1em] text-ramrod-foreground disabled:opacity-50"><Printer className="h-3.5 w-3.5" aria-hidden="true" />PRINT / SAVE PDF</button></div><p className={`mt-4 text-xs font-semibold ${run.bundle.submissionValidation.status === "PASS" ? "text-ramrod-primary" : "text-red-500"}`}>SUBMISSION VALIDATION · {run.bundle.submissionValidation.status}</p>{run.bundle.submissionValidation.errors.map((error) => <p key={error} className="mt-1 text-[10px] text-red-500">{error}</p>)}{caseFile ? <iframe title="Case file preview" sandbox="" srcDoc={caseFile} className="mt-5 h-[580px] w-full border border-ramrod-foreground/20 bg-white" /> : <p className="mt-5 text-sm text-ramrod-muted-foreground">This replay bundle does not include a case file preview.</p>}</div>;
}

function AuditLogView({ bundle }: { bundle: ForensicRunBundle }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]"><ol className="space-y-3">{bundle.auditLog.map((event) => <li key={event.sequence} className="grid grid-cols-[auto_1fr] gap-x-3 border-l border-ramrod-foreground/18 pl-3"><time className="text-[10px] font-bold text-ramrod-primary">{localTime(event.timestamp)}</time><div><p className="text-xs font-semibold text-ramrod-foreground">{event.event.replaceAll("_", " ")}</p><p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{event.details}</p>{event.recordIds.length > 0 && <p className="mt-1 text-[9px] font-bold tracking-[0.09em] text-ramrod-muted-foreground">{event.recordIds.join(" · ")}</p>}</div></li>)}</ol><section className="border-t border-ramrod-foreground/15 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"><div className="flex items-center gap-2"><Wrench className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" /><h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">LOCAL TOOL ACTIVITY</h3></div><ul className="mt-4 space-y-3">{bundle.toolLog.map((tool) => <li key={tool.executionId} className="border-l border-ramrod-foreground/18 pl-3"><div className="flex justify-between gap-2"><span className="text-[10px] font-bold text-ramrod-foreground">{tool.tool}</span><span className={tool.status === "completed" ? "text-[9px] font-bold text-ramrod-primary" : "text-[9px] font-bold text-red-500"}>{tool.status.toUpperCase()}</span></div><p className="mt-1 text-[10px] text-ramrod-muted-foreground">{tool.resultSummary}</p><p className="mt-1 text-[9px] text-ramrod-muted-foreground">{tool.durationMs} ms · {tool.recordIds.join(" · ")}</p></li>)}</ul></section></div>;
}

export function ForensicInvestigationWorkspace() {
  const router = useTransitionRouter();
  const params = useParams<{ id?: string }>();
  const [state, setState] = useState<WorkspaceState>({ status: "loading" });
  const [view, setView] = useState<View>("analysis");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    const run = readForensicRun();
    setState(run && run.runId === params.id ? { status: "ready", run } : { status: "missing" });
  }, [params.id]);

  if (state.status === "loading") return <div className="flex flex-1 items-center justify-center text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">OPENING FORENSIC RUN</div>;
  if (state.status === "missing") return <div className="flex flex-1 items-center justify-center px-6"><section className="max-w-md border border-ramrod-foreground/20 bg-ramrod-card/45 p-7 text-center"><Search className="mx-auto h-6 w-6 text-ramrod-primary" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold text-ramrod-foreground">No forensic run is available.</h2><p className="mt-2 text-sm text-ramrod-muted-foreground">Load an estate or replay a run bundle from the Command Center.</p><button type="button" onClick={() => router.push("/mainpage")} className="mt-5 inline-flex items-center gap-2 border border-ramrod-primary bg-ramrod-primary px-4 py-2.5 text-[10px] font-bold tracking-[0.12em] text-ramrod-primary-foreground"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />RAMROD</button></section></div>;

  const { run } = state;
  const bundle = run.bundle;
  const totalExposure = bundle.findings.reduce((total, finding) => total + finding.pesoAmount, 0);
  const handleAsk = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (question.trim()) { setAnswer(answerCaseQuestion(bundle, question.trim())); setQuestion(""); } };
  const content = view === "analysis" ? <FindingList findings={bundle.findings} onSelectTrail={() => setView("money-trail")} /> : view === "evidence" ? <EvidenceView bundle={bundle} /> : view === "money-trail" ? <MoneyTrailView findings={bundle.findings} /> : view === "declined" ? <DeclinedLeadsView bundle={bundle} /> : view === "case-file" ? <CaseFileView run={run} /> : <AuditLogView bundle={bundle} />;

  return <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-8 pt-4 sm:px-6 sm:pb-10"><header className="border-b border-ramrod-foreground/15 pb-5"><button type="button" onClick={() => router.push("/mainpage")} className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-ramrod-muted-foreground hover:text-ramrod-foreground"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />RAMROD</button><div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-extrabold text-ramrod-foreground sm:text-2xl">{run.runId}</h2><span className={`border px-2 py-1 text-[9px] font-bold tracking-[0.12em] ${bundle.submissionValidation.status === "PASS" ? "border-ramrod-primary/40 bg-ramrod-primary/10 text-ramrod-primary" : "border-red-500/40 bg-red-500/10 text-red-500"}`}>VALIDATION · {bundle.submissionValidation.status}</span></div><p className="mt-2 text-sm font-semibold text-ramrod-foreground">Company RFC: {bundle.normalizedCaseSummary.companyRfc}</p><p className="mt-1 text-xs text-ramrod-muted-foreground">{bundle.normalizedCaseSummary.auditPeriod || "Audit period unavailable"} · {bundle.normalizedCaseSummary.sourceFormat} · {bundle.metrics.engineVersion}</p></div><dl className="grid grid-cols-3 gap-x-5 border-l border-ramrod-foreground/15 pl-4 sm:gap-x-8"><SummaryPoint label="FINDINGS" value={String(bundle.findings.length)} /><SummaryPoint label="EXPOSURE" value={money(totalExposure)} /><SummaryPoint label="CLOSED LEADS" value={String(bundle.declinedLeads.length)} /></dl></div></header>
    <div className="grid flex-1 gap-6 py-6 xl:grid-cols-[minmax(190px,0.7fr)_minmax(0,2fr)_minmax(230px,0.85fr)] xl:gap-8"><aside className="order-2 border-t border-ramrod-foreground/15 pt-5 xl:order-1 xl:border-r xl:border-t-0 xl:pr-6 xl:pt-0"><h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">INVESTIGATION TIMELINE</h3><ol className="mt-4 space-y-3">{bundle.auditLog.slice(0, 8).map((event) => <li key={event.sequence} className="border-l border-ramrod-primary/35 pl-3"><p className="text-[9px] font-bold text-ramrod-primary">{localTime(event.timestamp)}</p><p className="mt-0.5 text-xs font-semibold text-ramrod-foreground">{event.event.replaceAll("_", " ")}</p><p className="mt-1 text-[10px] leading-relaxed text-ramrod-muted-foreground">{event.details}</p></li>)}</ol><section className="mt-7 border-t border-ramrod-foreground/15 pt-5"><h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">RUN METADATA</h3><dl className="mt-3 grid grid-cols-2 gap-4"><SummaryPoint label="LLM CALLS" value={String(bundle.metrics.llmCalls)} /><SummaryPoint label="MXN COST" value={money(bundle.metrics.mxnCost)} /><SummaryPoint label="WALL CLOCK" value={`${bundle.metrics.wallClockSeconds}s`} /><SummaryPoint label="DETERMINISTIC" value={bundle.metrics.deterministic ? "YES" : "NO"} /></dl></section></aside>
      <section className="order-1 min-w-0 xl:order-2"><div className="flex gap-1 overflow-x-auto border-b border-ramrod-foreground/15 pb-px" role="tablist" aria-label="Forensic case views">{views.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)} className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-[10px] font-bold tracking-[0.08em] ${view === item.id ? "border-ramrod-primary text-ramrod-primary" : "border-transparent text-ramrod-muted-foreground hover:text-ramrod-foreground"}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{item.label.toUpperCase()}</button>; })}</div><div className="pt-5" role="tabpanel">{content}</div></section>
      <aside className="order-3 border-t border-ramrod-foreground/15 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"><div className="flex items-center gap-2"><FileCheck2 className="h-3.5 w-3.5 text-ramrod-primary" aria-hidden="true" /><h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">VALIDATION</h3></div><ul className="mt-4 space-y-3">{[`${bundle.findings.length} findings passed record checks`, `${bundle.evidence.length} immutable evidence items`, `${bundle.toolLog.length} local tool executions`, bundle.submissionValidation.status === "PASS" ? "Submission structure ready" : "Submission requires repair"].map((item) => <li key={item} className="flex gap-2 text-xs text-ramrod-foreground"><CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${bundle.submissionValidation.status === "PASS" ? "text-ramrod-primary" : "text-red-500"}`} aria-hidden="true" />{item}</li>)}</ul><section className="mt-7 border-t border-ramrod-foreground/15 pt-5"><h3 className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">INPUT DIGEST</h3><p className="mt-2 break-all text-[10px] leading-relaxed text-ramrod-foreground">{bundle.normalizedCaseSummary.inputDigest}</p></section><EstateMcpContextPanel companyRfc={bundle.normalizedCaseSummary.companyRfc} /></aside></div>
    <section className="border-t border-ramrod-foreground/15 pt-5" aria-labelledby="ask-ramrod-title"><div className="flex items-baseline justify-between gap-3"><h3 id="ask-ramrod-title" className="text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">ASK RAMROD ABOUT THIS CASE</h3><span className="text-[9px] text-ramrod-muted-foreground">Run-bundle grounded</span></div><form onSubmit={handleAsk} className="mt-3 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Why finding F-001?" className="min-w-0 flex-1 border border-ramrod-foreground/20 bg-ramrod-card/45 px-4 py-3 text-sm text-ramrod-foreground outline-none placeholder:text-ramrod-muted-foreground focus:border-ramrod-primary" /><button type="submit" className="border border-ramrod-primary bg-ramrod-primary px-4 text-[10px] font-bold tracking-[0.1em] text-ramrod-primary-foreground hover:bg-ramrod-foreground">ASK</button></form>{answer && <p className="mt-3 border-l border-ramrod-primary pl-3 text-xs leading-relaxed text-ramrod-foreground">{answer}</p>}</section>
  </div>;
}
