import { getMCPErrorResponse, getMCPHealthUrl } from "@/lib/mcp/client";

export const runtime = "nodejs";

const HEALTH_TIMEOUT_MS = 10_000;

export async function GET() {
  try {
    const response = await fetch(getMCPHealthUrl(), {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    let server: unknown = null;
    try {
      server = await response.json();
    } catch {
      server = { statusText: response.statusText };
    }

    return Response.json(
      {
        ok: response.ok,
        status: response.status,
        server,
      },
      { status: response.ok ? 200 : 503 },
    );
  } catch (error) {
    const { status, message } = getMCPErrorResponse(error);
    return Response.json({ ok: false, error: message }, { status });
  }
}