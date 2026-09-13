import "server-only";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const CLIENT_INFO = {
  name: "forensic-investigation-app",
  version: "1.0.0",
};
const DEFAULT_TIMEOUT_MS = 15_000;

type MCPErrorCode =
  | "configuration"
  | "timeout"
  | "tool_not_found"
  | "invalid_response";

type MCPArguments = Record<string, unknown>;
type MCPTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
type MCPToolResult = Awaited<ReturnType<Client["callTool"]>>;

export class MCPClientError extends Error {
  constructor(
    message: string,
    readonly code: MCPErrorCode,
  ) {
    super(message);
    this.name = "MCPClientError";
  }
}

export type MCPConnection = {
  client: Client;
};

function getMCPServerUrl(): URL {
  const value = process.env.MCP_SERVER_URL;

  if (!value) {
    throw new MCPClientError(
      "MCP_SERVER_URL is not configured.",
      "configuration",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MCPClientError(
      "MCP_SERVER_URL must be a valid URL.",
      "configuration",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MCPClientError(
      "MCP_SERVER_URL must use HTTP or HTTPS.",
      "configuration",
    );
  }

  return url;
}

export function getMCPHealthUrl(): URL {
  const url = new URL(getMCPServerUrl());
  url.pathname = url.pathname.replace(/\/mcp\/?$/, "/health");
  url.search = "";
  url.hash = "";

  return url;
}

function withTimeout<T>(operation: Promise<T>, description: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new MCPClientError(
          `The MCP server timed out while ${description}.`,
          "timeout",
        ),
      );
    }, DEFAULT_TIMEOUT_MS);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function connectMCP(): Promise<MCPConnection> {
  const client = new Client(CLIENT_INFO, {
    versionNegotiation: {
      mode: "auto",
    },
  });
  const transport = new StreamableHTTPClientTransport(getMCPServerUrl());

  try {
    await withTimeout(client.connect(transport), "connecting");
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }

  return { client };
}

export async function closeMCPConnection(
  connection: MCPConnection,
): Promise<void> {
  await connection.client.close();
}

async function withMCPConnection<T>(
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const connection = await connectMCP();

  try {
    return await operation(connection.client);
  } finally {
    await closeMCPConnection(connection);
  }
}

export async function listMCPTools(): Promise<MCPTool[]> {
  return withMCPConnection(async (client) => {
    const response = await withTimeout(client.listTools(), "listing tools");

    if (!Array.isArray(response.tools)) {
      throw new MCPClientError(
        "The MCP server returned an invalid tools response.",
        "invalid_response",
      );
    }

    return response.tools;
  });
}

export async function callMCPTool(
  toolName: string,
  arguments_: MCPArguments,
): Promise<MCPToolResult> {
  return withMCPConnection(async (client) => {
    const availableTools = await withTimeout(
      client.listTools(),
      "validating the requested tool",
    );

    if (!Array.isArray(availableTools.tools)) {
      throw new MCPClientError(
        "The MCP server returned an invalid tools response.",
        "invalid_response",
      );
    }

    if (!availableTools.tools.some((tool) => tool.name === toolName)) {
      throw new MCPClientError(
        `The MCP tool \"${toolName}\" is not available.`,
        "tool_not_found",
      );
    }

    const response = await withTimeout(
      client.callTool({ name: toolName, arguments: arguments_ }),
      `calling \"${toolName}\"`,
    );

    if (!isRecord(response) || !Array.isArray(response.content)) {
      throw new MCPClientError(
        "The MCP server returned an invalid tool response.",
        "invalid_response",
      );
    }

    return response;
  });
}

export async function getMCPServerInfo(): Promise<MCPToolResult> {
  return callMCPTool("server_info", {});
}

export function getMCPErrorResponse(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof MCPClientError) {
    const statusByCode: Record<MCPErrorCode, number> = {
      configuration: 500,
      timeout: 504,
      tool_not_found: 404,
      invalid_response: 502,
    };

    return { status: statusByCode[error.code], message: error.message };
  }

  return {
    status: 503,
    message: "The MCP server is unavailable.",
  };
}