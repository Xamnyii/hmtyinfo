import { getMCPErrorResponse, listMCPTools } from "@/lib/mcp/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tools = await listMCPTools();
    return Response.json({ ok: true, tools });
  } catch (error) {
    const { status, message } = getMCPErrorResponse(error);
    return Response.json({ ok: false, error: message }, { status });
  }
}