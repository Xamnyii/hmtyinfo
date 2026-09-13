"use client";

import { CheckCircle2, Database, FileArchive, FileJson2, LoaderCircle, Play, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { useTransitionRouter } from "next-transition-router";
import { toast } from "sonner";
import { analyzeEstateFile } from "./estate-analysis-client";
import { readForensicRun, saveForensicRun } from "./estate-run-storage";
import { normalizeForensicRunBundle, type ForensicRunBundle } from "./forensic-run-types";

const MAX_ESTATE_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const stages = ["VALIDATING", "INDEXING", "DETECTING", "INVESTIGATING", "CHALLENGING", "VALIDATING FINDINGS", "COMPLETED"] as const;

type EstateStage = typeof stages[number] | "IDLE" | "ERROR";

function fileTypeIcon(name: string) {
  return name.toLowerCase().endsWith(".zip") ? FileArchive : Database;
}

function runIdFromBundle(bundle: ForensicRunBundle): string {
  return `RUN-${bundle.normalizedCaseSummary.inputDigest.slice(0, 12).toUpperCase()}`;
}

function readBundleFile(file: File): Promise<ForensicRunBundle> {
  return file.text().then((text) => normalizeForensicRunBundle(JSON.parse(text) as unknown));
}

function stagesFromAuditLog(bundle: ForensicRunBundle): Set<typeof stages[number]> {
  const events = new Set(bundle.auditLog.map((event) => event.event));
  const completed = new Set<typeof stages[number]>(["VALIDATING"]);
  if (events.has("estate_indexed")) completed.add("INDEXING");
  if (events.has("detectors_completed")) completed.add("DETECTING");
  if (events.has("investigator_opened")) completed.add("INVESTIGATING");
  if (events.has("challenger_opened")) completed.add("CHALLENGING");
  if (events.has("validator_opened") || events.has("submission_validated")) completed.add("VALIDATING FINDINGS");
  if (events.has("run_completed")) completed.add("COMPLETED");
  return completed;
}

export function EstateIntake() {
  const router = useTransitionRouter();
  const estateInputRef = useRef<HTMLInputElement>(null);
  const replayInputRef = useRef<HTMLInputElement>(null);
  const [seed, setSeed] = useState("0");
  const [stage, setStage] = useState<EstateStage>("IDLE");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [completedStages, setCompletedStages] = useState<Set<typeof stages[number]>>(new Set());

  const openRun = (runId: string, bundle: ForensicRunBundle, caseFileHtml?: string) => {
    try {
      saveForensicRun({ runId, bundle, caseFileHtml: caseFileHtml || bundle.caseFileHtml, storedAt: new Date().toISOString() });
      router.push(`/investigacion/${runId}`);
    } catch {
      setStage("ERROR");
      toast.error("El run bundle supera el almacenamiento disponible en este navegador.");
    }
  };

  const analyze = async (file: File) => {
    if (!/\.(zip|db|sqlite|sqlite3)$/i.test(file.name)) {
      toast.error("Sube estate_csv.zip o estate.db.");
      return;
    }
    if (file.size === 0 || file.size > MAX_ESTATE_FILE_SIZE_BYTES) {
      toast.error("El estate está vacío o supera el límite de 50 MB.");
      return;
    }
    if (!/^-?\d+$/.test(seed.trim())) {
      toast.error("El seed debe ser un entero.");
      return;
    }
    setSelectedFileName(file.name);
    setIsWorking(true);
    setStage("VALIDATING");
    try {
      const result = await analyzeEstateFile(file, Number(seed));
      setStage("COMPLETED");
      setCompletedStages(stagesFromAuditLog(result.runBundle));
      if (result.runBundle.submissionValidation.status !== "PASS") {
        toast.error("La corrida terminó, pero la submission no pasó validación.");
      }
      openRun(result.runId, result.runBundle, result.caseFileHtml);
    } catch (error) {
      setStage("ERROR");
      toast.error(error instanceof Error ? error.message : "RamRod no pudo analizar el estate.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleEstateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void analyze(file);
  };

  const handleReplayChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsWorking(true);
    setStage("VALIDATING");
    void readBundleFile(file)
      .then((bundle) => {
        setStage("COMPLETED");
        setCompletedStages(stagesFromAuditLog(bundle));
        openRun(runIdFromBundle(bundle), bundle);
      })
      .catch((error: unknown) => {
        setStage("ERROR");
        toast.error(error instanceof Error ? error.message : "El run bundle no es válido.");
      })
      .finally(() => setIsWorking(false));
  };

  const resumeLatestRun = () => {
    const stored = readForensicRun();
    if (!stored) {
      toast.error("No hay una corrida forense guardada en esta sesión.");
      return;
    }
    router.push(`/investigacion/${stored.runId}`);
  };

  const EstateIcon = selectedFileName ? fileTypeIcon(selectedFileName) : Upload;

  return (
    <section className="w-full max-w-xl border-t border-ramrod-foreground/15 pt-4" aria-labelledby="estate-intake-title">
      <input ref={estateInputRef} type="file" accept=".zip,.db,.sqlite,.sqlite3,application/zip,application/x-sqlite3" className="sr-only" onChange={handleEstateChange} />
      <input ref={replayInputRef} type="file" accept=".json,application/json" className="sr-only" onChange={handleReplayChange} />
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="estate-intake-title" className="text-[11px] font-bold tracking-[0.14em] text-ramrod-foreground">SUBIR ESTATE</h2>
          <p className="mt-0.5 text-xs text-ramrod-muted-foreground">estate_csv.zip o estate.db para auditoría determinista offline</p>
        </div>
        <label className="grid shrink-0 gap-1 text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">
          SEED
          <input value={seed} onChange={(event) => setSeed(event.target.value)} inputMode="numeric" disabled={isWorking} aria-label="Seed de la corrida" className="w-20 border border-ramrod-foreground/20 bg-ramrod-card/45 px-2 py-1.5 text-xs font-semibold tracking-normal text-ramrod-foreground outline-none focus:border-ramrod-primary" />
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <button type="button" disabled={isWorking} onClick={() => estateInputRef.current?.click()} className="flex min-w-0 items-center gap-3 border border-ramrod-foreground/20 bg-ramrod-card/35 px-4 py-3 text-left transition-colors hover:border-ramrod-primary disabled:cursor-wait disabled:opacity-70">
          {isWorking ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-ramrod-primary" aria-hidden="true" /> : stage === "COMPLETED" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ramrod-primary" aria-hidden="true" /> : <EstateIcon className="h-4 w-4 shrink-0 text-ramrod-primary" aria-hidden="true" />}
          <span className="min-w-0"><span className="block truncate text-xs font-semibold text-ramrod-foreground">{selectedFileName || "Seleccionar estate"}</span><span className="mt-0.5 block text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">{stage === "IDLE" ? "ZIP / SQLITE" : stage}</span></span>
        </button>
        <button type="button" disabled={isWorking} onClick={() => replayInputRef.current?.click()} className="flex h-11 items-center justify-center border border-ramrod-foreground/20 px-3 text-ramrod-muted-foreground transition-colors hover:border-ramrod-primary hover:text-ramrod-primary disabled:opacity-60" aria-label="Cargar run bundle para replay" title="Replay Run">
          <FileJson2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" disabled={isWorking} onClick={resumeLatestRun} className="flex h-11 items-center justify-center border border-ramrod-primary bg-ramrod-primary px-3 text-ramrod-primary-foreground transition-colors hover:bg-ramrod-foreground disabled:opacity-60" aria-label="Abrir última corrida forense" title="Open latest run">
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {stage === "COMPLETED" && <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1" aria-label="Fases registradas de la corrida">{stages.map((label) => <li key={label} className={`text-[9px] font-bold tracking-[0.1em] ${completedStages.has(label) ? "text-ramrod-primary" : "text-ramrod-muted-foreground"}`}>{label}{completedStages.has(label) ? " · DONE" : " · NOT REQUIRED"}</li>)}</ol>}
      {stage === "ERROR" && <p className="mt-3 text-[10px] font-medium text-red-500">ERROR · Revisa el formato del estate y la disponibilidad del servicio local.</p>}
    </section>
  );
}