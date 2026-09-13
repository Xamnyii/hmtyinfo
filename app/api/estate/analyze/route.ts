export const runtime = "nodejs";

const MAX_ESTATE_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ANALYZER_TIMEOUT_MS = 120_000;

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
    url.pathname = `${url.pathname.replace(/\/$/, "")}/estate/analyze`;
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
    return Response.json({ ok: false, error: "La solicitud debe contener un estate multipart válido." }, { status: 400 });
  }
  const estate = formData.get("estate");
  const seed = formData.get("seed");
  if (!(estate instanceof File)) {
    return Response.json({ ok: false, error: "Se requiere un archivo estate." }, { status: 400 });
  }
  if (!/\.(zip|db|sqlite|sqlite3)$/i.test(estate.name)) {
    return Response.json({ ok: false, error: "El estate debe ser un archivo .zip o .db." }, { status: 400 });
  }
  if (estate.size === 0 || estate.size > MAX_ESTATE_FILE_SIZE_BYTES) {
    return Response.json({ ok: false, error: "El estate está vacío o supera el límite de 50 MB." }, { status: 400 });
  }
  if (typeof seed !== "string" || !/^-?\d+$/.test(seed.trim())) {
    return Response.json({ ok: false, error: "El seed debe ser un entero." }, { status: 400 });
  }
  const analyzerUrl = getAnalyzerUrl();
  if (!analyzerUrl) {
    return Response.json({ ok: false, error: "El servicio de análisis no está configurado." }, { status: 503 });
  }
  const analyzerFormData = new FormData();
  analyzerFormData.append("estate", estate, estate.name);
  analyzerFormData.append("seed", seed.trim());
  try {
    const response = await fetch(analyzerUrl, {
      method: "POST",
      body: analyzerFormData,
      cache: "no-store",
      signal: AbortSignal.timeout(ANALYZER_TIMEOUT_MS),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) {
      return Response.json({ ok: false, error: getErrorMessage(payload) || "RamRod no pudo analizar el estate." }, { status: response.ok ? 502 : response.status });
    }
    return Response.json(payload, { status: response.status });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ ok: false, error: isTimeout ? "El análisis del estate tardó demasiado." : "El servicio de análisis no está disponible." }, { status: isTimeout ? 504 : 503 });
  }
}