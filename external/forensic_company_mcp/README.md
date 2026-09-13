# Forensic Company MCP

MCP server in Python for corporate OSINT / compliance research.

## Tools

- `server_info`
- `normalize_company_name`
- `compare_company_names`
- `compare_addresses`
- `search_gleif_company`
- `screen_opensanctions_company`
- `get_opensanctions_entity`
- `build_relationship_graph`

The server deliberately labels matches and shared attributes as investigative leads rather than proof of wrongdoing.

## 1. Create the environment

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Python 3.10+ is supported by MCP SDK v2.

## 2. Optional OpenSanctions key

Edit `.env`:

```env
OPENSANCTIONS_API_KEY=YOUR_KEY
```

Do not put this key in Expo or React Native source code.

## 3. Run locally

```bash
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

MCP endpoint:

```text
http://127.0.0.1:8000/mcp
```

Health check:

```text
http://127.0.0.1:8000/health
```

## 4. Test it

In another terminal:

```bash
source .venv/bin/activate
python client_test.py
```

Or use MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector
```

Then connect the inspector to:

```text
http://127.0.0.1:8000/mcp
```

## 5. Render

Build command:

```text
pip install -r requirements.txt
```

Start command:

```text
uvicorn server:app --host 0.0.0.0 --port $PORT
```

Set these environment variables in Render:

```env
OPENSANCTIONS_API_KEY=...
MCP_ALLOWED_HOSTS=YOUR-SERVICE.onrender.com,YOUR-SERVICE.onrender.com:*
CORS_ORIGINS=https://YOUR-FRONTEND.example
```

For a native-only React Native client, `CORS_ORIGINS` is less important because CORS is a browser rule. Keep the MCP provider API keys server-side either way.

## Example graph input

Call `build_relationship_graph` with `companies_json` containing:

```json
[
  {
    "name": "Empresa A",
    "address": "Av. Ejemplo 100, Monterrey, NL",
    "officers": ["Persona Uno"]
  },
  {
    "name": "Empresa B",
    "address": "Avenida Ejemplo 100, Monterrey, NL",
    "officers": ["Persona Uno", "Persona Dos"]
  }
]
```

The tool returns nodes and relationship edges such as `shared_address` and `shared_officer`.

## Important

A sanctions hit, shared address, shared officer, or high name similarity is not by itself evidence of money laundering, a shell company, fraud, or any crime. Preserve the source, entity IDs, dates, and original records so findings can be independently verified.
