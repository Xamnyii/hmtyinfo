export const runtime = "nodejs";

const MAX_RUN_BUNDLE_SIZE_BYTES = 50 * 1024 * 1024;
const ANALYZER_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.error === "string" ? value.error : typeof value.detail === "string" ? value.detail : undefined;
}

function getAnalyzerUrl(): URL | null {
  const configuredUrl = process.env.CFDI_ANALYZER_URL;
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = `${url.pathname.replace(/\/$/, "")}/estate/replay`;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "La solicitud debe contener un run bundle multipart válido." }, { status: 400 });
  }
  const runBundle = formData.get("runBundle");
  if (!(runBundle instanceof File) || !runBundle.name.toLowerCase().endsWith(".json")) {
    return Response.json({ ok: false, error: "Se requiere un archivo run_bundle.json." }, { status: 400 });
  }
  if (runBundle.size === 0 || runBundle.size > MAX_RUN_BUNDLE_SIZE_BYTES) {
    return Response.json({ ok: false, error: "El run bundle está vacío o supera el límite de 50 MB." }, { status: 400 });
  }
  const analyzerUrl = getAnalyzerUrl();
  if (!analyzerUrl) {
    return Response.json({ ok: false, error: "El servicio de análisis no está configurado." }, { status: 503 });
  }
  const analyzerFormData = new FormData();
  analyzerFormData.append("run_bundle", runBundle, runBundle.name);
  try {
    const response = await fetch(analyzerUrl, { method: "POST", body: analyzerFormData, cache: "no-store", signal: AbortSignal.timeout(ANALYZER_TIMEOUT_MS) });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) {
      return Response.json({ ok: false, error: getErrorMessage(payload) || "RamRod no pudo cargar el run bundle." }, { status: response.ok ? 502 : response.status });
    }
    return Response.json(payload, { status: response.status });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ ok: false, error: isTimeout ? "El replay tardó demasiado." : "El servicio de análisis no está disponible." }, { status: isTimeout ? 504 : 503 });
  }
}