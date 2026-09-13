import asyncio
import json
import os

from mcp import Client

MCP_URL = os.getenv("MCP_URL", "http://127.0.0.1:8000/mcp")


async def main() -> None:
    async with Client(MCP_URL) as client:
        tools = await client.list_tools()
        print("Tools:", [tool.name for tool in tools.tools])

        result = await client.call_tool(
            "compare_company_names",
            {
                "name_a": "Ejemplo Comercial, S.A. de C.V.",
                "name_b": "Ejemplo Comercial SA CV",
            },
        )
        print(json.dumps(result.structured_content, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
