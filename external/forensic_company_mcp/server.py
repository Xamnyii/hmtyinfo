from __future__ import annotations

import json
import os
import re
import unicodedata
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount

load_dotenv()

SERVER_NAME = "forensic-company-mcp"
GLEIF_BASE_URL = "https://api.gleif.org/api/v1"
OPENSANCTIONS_BASE_URL = "https://api.opensanctions.org"
REQUEST_TIMEOUT_SECONDS = 25.0

mcp = MCPServer(SERVER_NAME)


def _csv_env(name: str, default: str = "") -> list[str]:
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def _strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(ch)
    )


def _normalize_text(text: str) -> str:
    text = _strip_accents(text).lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _normalize_company_name(name: str) -> str:
    text = _normalize_text(name)
    suffixes = {
        "sa", "sas", "sapi", "srl", "sc", "ac", "cv", "de", "rl",
        "llc", "inc", "corp", "corporation", "ltd", "limited", "plc",
    }
    tokens = [token for token in text.split() if token not in suffixes]
    return " ".join(tokens)


def _normalize_address(address: str) -> str:
    text = _normalize_text(address)
    replacements = {
        "avenida": "av",
        "avda": "av",
        "calle": "",
        "boulevard": "blvd",
        "numero": "",
        "no": "",
        "num": "",
    }
    tokens = [replacements.get(tok, tok) for tok in text.split()]
    return " ".join(tok for tok in tokens if tok)


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return round(SequenceMatcher(None, a, b).ratio(), 4)


def _safe_json_error(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except Exception:
        payload = {"body": response.text[:1000]}
    return {
        "status_code": response.status_code,
        "provider_error": payload,
    }


def _provider_connection_error(provider: str, error: httpx.RequestError) -> dict[str, Any]:
    return {
        "ok": False,
        "provider": provider,
        "error": "The external provider could not be reached from the MCP server.",
        "detail": str(error),
    }


@mcp.tool()
def server_info() -> dict[str, Any]:
    """Return server metadata and which optional data providers are configured."""
    return {
        "name": SERVER_NAME,
        "transport": "streamable-http",
        "endpoint": "/mcp",
        "health": "/health",
        "providers": {
            "gleif": {"configured": True, "api_key_required": False},
            "opensanctions": {
                "configured": bool(os.getenv("OPENSANCTIONS_API_KEY")),
                "api_key_required": True,
            },
        },
        "disclaimer": (
            "Results are investigative leads and source records, not proof of illegal activity. "
            "Corroborate material findings with original/official sources."
        ),
    }


@mcp.tool()
def normalize_company_name(name: str) -> dict[str, str]:
    """Normalize a company name to make cross-source comparisons easier."""
    return {
        "original": name,
        "normalized": _normalize_company_name(name),
    }


@mcp.tool()
def compare_company_names(name_a: str, name_b: str) -> dict[str, Any]:
    """Compare two company names after normalization and return a similarity score from 0 to 1."""
    normalized_a = _normalize_company_name(name_a)
    normalized_b = _normalize_company_name(name_b)
    score = _similarity(normalized_a, normalized_b)
    return {
        "name_a": name_a,
        "name_b": name_b,
        "normalized_a": normalized_a,
        "normalized_b": normalized_b,
        "similarity": score,
        "same_after_normalization": normalized_a == normalized_b and bool(normalized_a),
    }


@mcp.tool()
def compare_addresses(address_a: str, address_b: str) -> dict[str, Any]:
    """Compare two addresses after basic normalization; useful for detecting shared-address leads."""
    normalized_a = _normalize_address(address_a)
    normalized_b = _normalize_address(address_b)
    score = _similarity(normalized_a, normalized_b)
    return {
        "address_a": address_a,
        "address_b": address_b,
        "normalized_a": normalized_a,
        "normalized_b": normalized_b,
        "similarity": score,
        "likely_same_textual_address": score >= 0.9,
        "note": "A textual match is only a lead; verify the physical/legal address in an authoritative source.",
    }


@mcp.tool()
async def search_gleif_company(name: str, limit: int = 5) -> dict[str, Any]:
    """Search GLEIF LEI records by entity name. No API key is required."""
    limit = max(1, min(limit, 20))
    params = {
        "filter[entity.names]": name,
        "page[size]": str(limit),
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = await client.get(f"{GLEIF_BASE_URL}/lei-records", params=params)
    except httpx.RequestError as error:
        return {**_provider_connection_error("GLEIF", error), "query": name}

    if response.status_code >= 400:
        return {
            "ok": False,
            "provider": "GLEIF",
            "query": name,
            "error": _safe_json_error(response),
        }

    payload = response.json()
    results: list[dict[str, Any]] = []

    for item in payload.get("data", [])[:limit]:
        attrs = item.get("attributes", {})
        entity = attrs.get("entity", {}) or {}
        legal_name = (entity.get("legalName") or {}).get("name")
        legal_address = entity.get("legalAddress") or {}
        hq_address = entity.get("headquartersAddress") or {}
        registration_authority = entity.get("registrationAuthority") or {}

        results.append({
            "lei": attrs.get("lei"),
            "legal_name": legal_name,
            "entity_status": entity.get("status"),
            "jurisdiction": entity.get("jurisdiction"),
            "legal_address": {
                "lines": legal_address.get("addressLines", []),
                "city": legal_address.get("city"),
                "region": legal_address.get("region"),
                "postal_code": legal_address.get("postalCode"),
                "country": legal_address.get("country"),
            },
            "headquarters_address": {
                "lines": hq_address.get("addressLines", []),
                "city": hq_address.get("city"),
                "region": hq_address.get("region"),
                "postal_code": hq_address.get("postalCode"),
                "country": hq_address.get("country"),
            },
            "registration_authority": {
                "id": registration_authority.get("registrationAuthorityID") or registration_authority.get("id"),
                "entity_id": registration_authority.get("registrationAuthorityEntityID") or registration_authority.get("other"),
            },
            "source": "GLEIF LEI API",
        })

    return {
        "ok": True,
        "provider": "GLEIF",
        "query": name,
        "count": len(results),
        "results": results,
        "note": "GLEIF coverage is strongest for legal entities that have an LEI; absence is not evidence that a company does not exist.",
    }


@mcp.tool()
async def screen_opensanctions_company(
    name: str,
    country: str | None = None,
    registration_number: str | None = None,
    address: str | None = None,
    dataset: str = "default",
) -> dict[str, Any]:
    """Screen a company with OpenSanctions /match. Requires OPENSANCTIONS_API_KEY on the server."""
    api_key = os.getenv("OPENSANCTIONS_API_KEY")
    if not api_key:
        return {
            "ok": False,
            "provider": "OpenSanctions",
            "error": "OPENSANCTIONS_API_KEY is not configured on the server.",
        }

    properties: dict[str, list[str]] = {"name": [name]}
    if country:
        properties["country"] = [country]
    if registration_number:
        properties["registrationNumber"] = [registration_number]
    if address:
        properties["address"] = [address]

    query = {
        "schema": "Company",
        "properties": properties,
    }
    body = {"queries": {"q": query}}
    headers = {"Authorization": f"ApiKey {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = await client.post(
                f"{OPENSANCTIONS_BASE_URL}/match/{dataset}",
                headers=headers,
                json=body,
            )
    except httpx.RequestError as error:
        return {**_provider_connection_error("OpenSanctions", error), "query": query}

    if response.status_code >= 400:
        return {
            "ok": False,
            "provider": "OpenSanctions",
            "query": query,
            "error": _safe_json_error(response),
        }

    payload = response.json()
    response_q = (payload.get("responses") or {}).get("q") or {}
    raw_results = response_q.get("results") or []

    results = []
    for result in raw_results[:10]:
        properties = result.get("properties") or {}
        results.append({
            "id": result.get("id"),
            "caption": result.get("caption"),
            "schema": result.get("schema"),
            "score": result.get("score"),
            "datasets": result.get("datasets", []),
            "topics": properties.get("topics", []),
            "countries": properties.get("country", []),
            "registration_numbers": properties.get("registrationNumber", []),
            "source": "OpenSanctions",
        })

    return {
        "ok": True,
        "provider": "OpenSanctions",
        "query": query,
        "count": len(results),
        "results": results,
        "note": (
            "A match score is a screening lead, not a finding of wrongdoing. "
            "Review the matched entity and its source datasets before drawing conclusions."
        ),
    }


@mcp.tool()
async def get_opensanctions_entity(entity_id: str) -> dict[str, Any]:
    """Fetch a full OpenSanctions entity by canonical ID. Requires OPENSANCTIONS_API_KEY."""
    api_key = os.getenv("OPENSANCTIONS_API_KEY")
    if not api_key:
        return {
            "ok": False,
            "provider": "OpenSanctions",
            "error": "OPENSANCTIONS_API_KEY is not configured on the server.",
        }

    headers = {"Authorization": f"ApiKey {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = await client.get(
                f"{OPENSANCTIONS_BASE_URL}/entities/{entity_id}",
                headers=headers,
            )
    except httpx.RequestError as error:
        return {**_provider_connection_error("OpenSanctions", error), "entity_id": entity_id}

    if response.status_code >= 400:
        return {
            "ok": False,
            "provider": "OpenSanctions",
            "entity_id": entity_id,
            "error": _safe_json_error(response),
        }

    payload = response.json()
    return {
        "ok": True,
        "provider": "OpenSanctions",
        "entity_id": entity_id,
        "entity": payload,
        "note": "Preserve the entity ID and source datasets in your case notes for traceability.",
    }


@mcp.tool()
def build_relationship_graph(companies_json: str) -> dict[str, Any]:
    """
    Build a simple relationship graph from company records.

    Input JSON must be a list of objects like:
    [{"name":"A","address":"...","officers":["Person X"]}, ...]
    Shared normalized addresses and officer names create edges.
    """
    try:
        raw = json.loads(companies_json)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"Invalid JSON: {exc}"}

    if not isinstance(raw, list):
        return {"ok": False, "error": "The JSON root must be a list of company objects."}

    companies: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or f"company_{index + 1}")
        address = str(item.get("address") or "")
        officers_raw = item.get("officers") or []
        officers = [str(x) for x in officers_raw] if isinstance(officers_raw, list) else []
        companies.append({
            "id": f"c{index + 1}",
            "name": name,
            "address": address,
            "normalized_address": _normalize_address(address),
            "officers": officers,
            "normalized_officers": [_normalize_text(x) for x in officers],
        })

    edges: list[dict[str, Any]] = []
    for i in range(len(companies)):
        for j in range(i + 1, len(companies)):
            left = companies[i]
            right = companies[j]

            if left["normalized_address"] and left["normalized_address"] == right["normalized_address"]:
                edges.append({
                    "from": left["id"],
                    "to": right["id"],
                    "type": "shared_address",
                    "value": left["address"],
                })

            shared_officers = sorted(
                set(left["normalized_officers"]) & set(right["normalized_officers"])
            )
            for officer in shared_officers:
                if officer:
                    edges.append({
                        "from": left["id"],
                        "to": right["id"],
                        "type": "shared_officer",
                        "value": officer,
                    })

    nodes = [
        {
            "id": company["id"],
            "label": company["name"],
            "address": company["address"],
            "officers": company["officers"],
        }
        for company in companies
    ]

    return {
        "ok": True,
        "nodes": nodes,
        "edges": edges,
        "edge_count": len(edges),
        "note": (
            "Shared addresses or officers can have legitimate explanations. "
            "Treat them as relationship leads requiring corroboration."
        ),
    }


@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request) -> Response:
    return JSONResponse({
        "status": "ok",
        "service": SERVER_NAME,
        "time": datetime.now(timezone.utc).isoformat(),
    })


# Browser / deployed-host configuration.
allowed_hosts = _csv_env(
    "MCP_ALLOWED_HOSTS",
    "127.0.0.1,127.0.0.1:*,localhost,localhost:*,[::1],[::1]:*",
)
allowed_origins = _csv_env(
    "CORS_ORIGINS",
    "http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081,http://127.0.0.1:19006",
)

security = TransportSecuritySettings(
    enable_dns_rebinding_protection=True,
    allowed_hosts=allowed_hosts,
    allowed_origins=allowed_origins,
)

mcp_http_app = mcp.streamable_http_app(
    transport_security=security,
    json_response=True,
    stateless_http=True,
)


@asynccontextmanager
async def lifespan(_: Starlette) -> AsyncIterator[None]:
    async with mcp.session_manager.run():
        yield


app = Starlette(
    routes=[Mount("/", app=mcp_http_app)],
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "Last-Event-ID",
                "Mcp-Method",
                "Mcp-Name",
                "Mcp-Protocol-Version",
                "Mcp-Session-Id",
            ],
            expose_headers=["Mcp-Session-Id"],
        )
    ],
    lifespan=lifespan,
)
