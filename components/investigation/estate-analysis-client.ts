import { ForensicRunClientError, normalizeForensicRunBundle, type ForensicRunBundle } from "./forensic-run-types";

type EstateAnalysisResponse = { runId: string; runBundle: ForensicRunBundle; caseFileHtml?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.error === "string" ? value.error : typeof value.detail === "string" ? value.detail : undefined;
}

export async function analyzeEstateFile(file: File, seed: number): Promise<EstateAnalysisResponse> {
  const formData = new FormData();
  formData.append("estate", file, file.name);
  formData.append("seed", String(seed));
  let response: Response;
  try {
    response = await fetch("/api/estate/analyze", { method: "POST", body: formData });
  } catch {
    throw new ForensicRunClientError("El servicio de análisis forense no está disponible.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.ok !== true) throw new ForensicRunClientError(errorMessage(payload) || "RamRod no pudo analizar el estate.");
  if (typeof payload.runId !== "string" || !payload.runId) throw new ForensicRunClientError("El análisis no devolvió un run ID.");
  return { runId: payload.runId, runBundle: normalizeForensicRunBundle(payload.runBundle), caseFileHtml: typeof payload.caseFileHtml === "string" ? payload.caseFileHtml : undefined };
}

export async function replayForensicRun(file: File): Promise<ForensicRunBundle> {
  const formData = new FormData();
  formData.append("runBundle", file, file.name);
  let response: Response;
  try {
    response = await fetch("/api/estate/replay", { method: "POST", body: formData });
  } catch {
    throw new ForensicRunClientError("El servicio de replay no está disponible.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.ok !== true) throw new ForensicRunClientError(errorMessage(payload) || "RamRod no pudo cargar el run bundle.");
  return normalizeForensicRunBundle(payload.runBundle);
}