import { callMCPTool, getMCPErrorResponse } from "@/lib/mcp/client";

export const runtime = "nodejs";

type CallRequest = {
  tool: string;
  arguments: Record<string, unknown>;
};

function isCallRequest(value: unknown): value is CallRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as Record<string, unknown>;
  return (
    typeof request.tool === "string" &&
    request.tool.trim().length > 0 &&
    typeof request.arguments === "object" &&
    request.arguments !== null &&
    !Array.isArray(request.arguments)
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!isCallRequest(body)) {
    return Response.json(
      {
        ok: false,
        error: "Request requires a non-empty tool string and an arguments object.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await callMCPTool(body.tool.trim(), body.arguments);
    return Response.json({ ok: true, result });
  } catch (error) {
    const { status, message } = getMCPErrorResponse(error);
    return Response.json({ ok: false, error: message }, { status });
  }
}