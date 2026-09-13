export const runtime = "nodejs";

const MAX_XML_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_XML_FILES_PER_ANALYSIS = 20;
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
    url.pathname = `${url.pathname.replace(/\/$/, "")}/analyze`;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isValidAnalysisResponse(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.files) && Array.isArray(value.invoices) && Array.isArray(value.entities) && Array.isArray(value.relationships) && Array.isArray(value.evidence) && Array.isArray(value.signals) && isRecord(value.metrics) && isRecord(value.summary);
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "La solicitud debe contener archivos multipart válidos." }, { status: 400 });
  }

  const entries = formData.getAll("files");
  if (entries.length === 0 || entries.some((entry) => !(entry instanceof File))) {
    return Response.json({ ok: false, error: "Se requiere al menos un archivo XML." }, { status: 400 });
  }
  if (entries.length > MAX_XML_FILES_PER_ANALYSIS) {
    return Response.json({ ok: false, error: `Se permite un máximo de ${MAX_XML_FILES_PER_ANALYSIS} archivos XML por análisis.` }, { status: 400 });
  }

  const files = entries as File[];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".xml")) {
      return Response.json({ ok: false, error: `El archivo ${file.name} no es XML.` }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ ok: false, error: `El archivo ${file.name} está vacío.` }, { status: 400 });
    }
    if (file.size > MAX_XML_FILE_SIZE_BYTES) {
      return Response.json({ ok: false, error: `El archivo ${file.name} supera el límite de 10 MB.` }, { status: 400 });
    }
  }

  const analyzerUrl = getAnalyzerUrl();
  if (!analyzerUrl) {
    return Response.json({ ok: false, error: "El servicio de análisis no está configurado." }, { status: 503 });
  }

  const analyzerFormData = new FormData();
  for (const file of files) analyzerFormData.append("files", file, file.name);

  try {
    const analyzerResponse = await fetch(analyzerUrl, {
      method: "POST",
      body: analyzerFormData,
      cache: "no-store",
      signal: AbortSignal.timeout(ANALYZER_TIMEOUT_MS),
    });
    const payload: unknown = await analyzerResponse.json().catch(() => null);

    if (!analyzerResponse.ok) {
      return Response.json(
        { ok: false, error: getErrorMessage(payload) || "RamRod no pudo analizar los XML." },
        { status: analyzerResponse.status >= 400 && analyzerResponse.status < 600 ? analyzerResponse.status : 502 },
      );
    }
    if (!isValidAnalysisResponse(payload)) {
      return Response.json({ ok: false, error: "El servicio de análisis devolvió una respuesta inválida." }, { status: 502 });
    }

    return Response.json({ ok: true, result: payload });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      { ok: false, error: isTimeout ? "El servicio de análisis tardó demasiado en responder." : "El servicio de análisis no está disponible." },
      { status: isTimeout ? 504 : 503 },
    );
  }
}