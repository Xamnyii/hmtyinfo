"use client";

import { CheckCircle2, FileWarning, FileUp, LoaderCircle, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useTransitionRouter } from "next-transition-router";
import { toast } from "sonner";
import { analyzeCfdiFiles } from "./cfdi-analysis-client";
import { createTemporaryCaseDraft, saveActiveCaseDraft } from "./case-draft-storage";
import { MAX_XML_FILE_SIZE_BYTES, MAX_XML_FILES_PER_ANALYSIS, type CfdiAnalysisResult, type UploadedXmlFile, type XmlFileStatus } from "./cfdi-types";

const MAX_VISIBLE_FILES = 3;

const statusLabels: Record<XmlFileStatus, string> = {
  pending: "PENDING",
  uploading: "UPLOADING",
  analyzing: "ANALYZING",
  parsed: "PARSED",
  error: "ERROR",
};

function createFileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAmount(amount: number, currency?: string): string {
  if (!currency) return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(amount);

  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }
}

function StatusIcon({ status }: { status: XmlFileStatus }) {
  if (status === "parsed") return <CheckCircle2 className="h-4 w-4 text-ramrod-primary" aria-hidden="true" />;
  if (status === "error") return <FileWarning className="h-4 w-4 text-red-500" aria-hidden="true" />;
  if (status === "uploading" || status === "analyzing") return <LoaderCircle className="h-4 w-4 animate-spin text-ramrod-primary" aria-hidden="true" />;
  return <FileUp className="h-4 w-4 text-ramrod-muted-foreground" aria-hidden="true" />;
}

export function CfdiIntake() {
  const router = useTransitionRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const activeFilesRef = useRef<Map<string, File>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedXmlFile[]>([]);
  const [analysis, setAnalysis] = useState<CfdiAnalysisResult | null>(null);
  const visibleFiles = uploadedFiles.slice(0, MAX_VISIBLE_FILES);
  const remainingFiles = uploadedFiles.length - visibleFiles.length;
  const canStartInvestigation = Boolean(analysis && analysis.metrics.validFiles > 0 && !isAnalyzing);

  const analyzeActiveFiles = async () => {
    const activeFileEntries = Array.from(activeFilesRef.current.entries());
    if (activeFileEntries.length === 0 || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysis(null);
    setUploadedFiles((files) => files.map((file) => ({ ...file, status: "analyzing", parsed: undefined, error: undefined })));

    try {
      const analysisResult = await analyzeCfdiFiles(activeFileEntries.map(([, file]) => file));
      const resultByIndex = new Map(analysisResult.files.map((file) => [file.fileIndex, file]));
      const indexById = new Map(activeFileEntries.map(([id], index) => [id, index]));

      setUploadedFiles((files) => files.map((file) => {
        const result = resultByIndex.get(indexById.get(file.id) ?? -1);
        if (!result) return { ...file, status: "error", parsed: undefined, error: "El servicio no devolvió un resultado para este XML." };
        return {
          ...file,
          status: result.status,
          parsed: result.parsed,
          error: result.error,
        };
      }));
      setAnalysis(analysisResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : "RamRod no pudo analizar los XML.";
      setUploadedFiles((files) => files.map((file) => ({ ...file, status: "error", parsed: undefined, error: message })));
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processFiles = async (files: File[]) => {
    if (isAnalyzing) {
      toast.error("RamRod todavía está analizando los archivos cargados.");
      return;
    }

    const acceptedFiles: Array<{ file: File; record: UploadedXmlFile }> = [];
    const availableSlots = MAX_XML_FILES_PER_ANALYSIS - activeFilesRef.current.size;

    for (const file of files) {
      if (acceptedFiles.length >= availableSlots) {
        toast.error(`Se permite un máximo de ${MAX_XML_FILES_PER_ANALYSIS} archivos XML por análisis.`);
        break;
      }
      if (!file.name.toLowerCase().endsWith(".xml")) {
        toast.error(`El archivo ${file.name} no es XML.`);
        continue;
      }

      if (file.size === 0) {
        toast.error(`El archivo ${file.name} está vacío.`);
        continue;
      }

      if (file.size > MAX_XML_FILE_SIZE_BYTES) {
        toast.error(`El archivo ${file.name} supera el límite de 10 MB.`);
        continue;
      }

      acceptedFiles.push({
        file,
        record: { id: createFileId(), name: file.name, size: file.size, status: "uploading" },
      });
    }

    if (acceptedFiles.length === 0) return;

    setUploadedFiles((currentFiles) => [...currentFiles, ...acceptedFiles.map(({ record }) => record)]);
    for (const { file, record } of acceptedFiles) activeFilesRef.current.set(record.id, file);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await analyzeActiveFiles();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void processFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void processFiles(Array.from(event.dataTransfer.files));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    inputRef.current?.click();
  };

  const handleStartInvestigation = () => {
    if (!analysis) return;
    const draft = createTemporaryCaseDraft(uploadedFiles, analysis);

    try {
      saveActiveCaseDraft(draft);
      router.push(`/investigacion/${draft.caseId}`);
    } catch {
      toast.error("No fue posible preparar la investigación en este navegador.");
    }
  };

  return (
    <section className="w-full max-w-xl" data-tour="new-investigation" aria-labelledby="xml-intake-title">
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />
      <div
        role="button"
        tabIndex={0}
        data-tour="evidence"
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`group flex cursor-pointer items-center justify-between gap-4 border px-4 py-3 backdrop-blur transition-colors sm:px-5${isDragging ? " border-ramrod-primary bg-ramrod-primary/15" : " border-ramrod-foreground/20 bg-ramrod-card/35 hover:border-ramrod-primary/65 hover:bg-ramrod-card/55"}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-ramrod-primary/40 bg-ramrod-primary/10 text-ramrod-primary">
            <Upload className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="xml-intake-title" className="text-[11px] font-bold tracking-[0.14em] text-ramrod-foreground">SUBIR FACTURAS XML</h2>
            <p className="mt-0.5 truncate text-xs text-ramrod-muted-foreground">Arrastra archivos CFDI o selecciónalos desde tu equipo</p>
          </div>
        </div>
        <span className="hidden shrink-0 text-[10px] font-bold tracking-[0.12em] text-ramrod-primary sm:block">MAX 10 MB</span>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-3 border-t border-ramrod-foreground/15 pt-2">
          <ul className="divide-y divide-ramrod-foreground/10" aria-label="Archivos XML cargados">
            {visibleFiles.map((file) => (
              <li key={file.id} className="flex items-center gap-3 py-2">
                <StatusIcon status={file.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-ramrod-foreground">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-ramrod-muted-foreground">{formatFileSize(file.size)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold tracking-[0.1em] text-ramrod-muted-foreground">
                    <span className={file.status === "error" ? "text-red-500" : file.status === "parsed" ? "text-ramrod-primary" : undefined}>{statusLabels[file.status]}</span>
                    {file.status === "parsed" && typeof file.parsed?.total === "number" && <span>{formatAmount(file.parsed.total, file.parsed.currency)}</span>}
                    {file.status === "error" && <span className="truncate font-medium normal-case tracking-normal">{file.error}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={(event) => {
                    event.stopPropagation();
                    activeFilesRef.current.delete(file.id);
                    setUploadedFiles((files) => files.filter((uploadedFile) => uploadedFile.id !== file.id));
                    setAnalysis(null);
                  }}
                  aria-label={`Eliminar ${file.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center text-ramrod-muted-foreground transition-colors hover:text-ramrod-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {remainingFiles > 0 && <p className="pt-2 text-[10px] font-bold tracking-[0.1em] text-ramrod-muted-foreground">+ {remainingFiles} ARCHIVOS MÁS</p>}
        </div>
      )}

      {canStartInvestigation && (
        <div className="mt-4 border-t border-ramrod-foreground/15 pt-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div><dt className="text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">ARCHIVOS</dt><dd className="mt-1 text-sm font-bold text-ramrod-foreground">{uploadedFiles.length}</dd></div>
            <div><dt className="text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">VÁLIDAS</dt><dd className="mt-1 text-sm font-bold text-ramrod-foreground">{analysis.metrics.validFiles}</dd></div>
            <div><dt className="text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">TOTAL DETECTADO</dt><dd className="mt-1 text-sm font-bold text-ramrod-foreground">{Object.entries(analysis.metrics.totalAmountByCurrency).map(([currency, amount]) => formatAmount(amount, currency)).join(" · ") || "No disponible"}</dd></div>
            <div><dt className="text-[9px] font-bold tracking-[0.12em] text-ramrod-muted-foreground">EMPRESAS</dt><dd className="mt-1 text-sm font-bold text-ramrod-foreground">{analysis.metrics.uniqueEntities}</dd></div>
          </dl>
          <button type="button" onClick={handleStartInvestigation} className="mt-4 w-full border border-ramrod-primary bg-ramrod-primary px-4 py-3 text-[11px] font-bold tracking-[0.14em] text-ramrod-primary-foreground transition-colors hover:bg-ramrod-foreground">
            INICIAR INVESTIGACIÓN
          </button>
        </div>
      )}

      {uploadedFiles.length > 0 && !canStartInvestigation && !isAnalyzing && (
        <button type="button" onClick={() => void analyzeActiveFiles()} className="mt-4 w-full border border-ramrod-foreground/25 bg-ramrod-card/45 px-4 py-3 text-[10px] font-bold tracking-[0.14em] text-ramrod-foreground transition-colors hover:border-ramrod-primary hover:text-ramrod-primary">
          ANALIZAR ARCHIVOS XML
        </button>
      )}
    </section>
  );
}