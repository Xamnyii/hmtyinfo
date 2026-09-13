from __future__ import annotations

import logging
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from analysis import analyze_invoices
from estate_adapters import EstateLoadError
from forensic_artifacts import case_file_html, load_run_bundle, run_bundle_payload
from forensic_runner import run_estate
from models import AnalysisResponse, AnalyzedFile
from parser import CfdiParseError, parse_cfdi

MAX_XML_FILE_SIZE_BYTES = 10 * 1024 * 1024
MAX_XML_FILES_PER_ANALYSIS = 20
MAX_ESTATE_FILE_SIZE_BYTES = 50 * 1024 * 1024

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ramrod.cfdi_analyzer")

app = FastAPI(title="RamRod CFDI Analyzer", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ramrod-cfdi-analyzer"}


@app.post("/analyze", response_model=AnalysisResponse, response_model_by_alias=True)
async def analyze(files: list[UploadFile] = File(default=[])) -> AnalysisResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Se requiere al menos un archivo XML.")
    if len(files) > MAX_XML_FILES_PER_ANALYSIS:
        raise HTTPException(
            status_code=400,
            detail=f"Se permite un máximo de {MAX_XML_FILES_PER_ANALYSIS} archivos XML por análisis.",
        )

    started_at = time.perf_counter()
    file_results: list[AnalyzedFile] = []
    invoices = []

    for index, upload in enumerate(files):
        filename = upload.filename or f"archivo-{index + 1}.xml"
        content_size = 0
        try:
            if not filename.lower().endswith(".xml"):
                raise CfdiParseError(f"El archivo {filename} no es XML.")

            content = await upload.read(MAX_XML_FILE_SIZE_BYTES + 1)
            content_size = len(content)
            if len(content) > MAX_XML_FILE_SIZE_BYTES:
                raise CfdiParseError(f"El archivo {filename} supera el límite de 10 MB.")

            invoice = parse_cfdi(content, index, filename)
            invoices.append(invoice)
            file_results.append(
                AnalyzedFile(
                    file_index=index,
                    name=filename,
                    size=len(content),
                    status="parsed",
                    parsed=invoice,
                )
            )
        except CfdiParseError as error:
            file_results.append(
                AnalyzedFile(
                    file_index=index,
                    name=filename,
                    size=content_size,
                    status="error",
                    error=str(error),
                )
            )
            logger.info("CFDI parsing failed for file_index=%s file_name=%s", index, filename)
        except Exception:
            file_results.append(
                AnalyzedFile(
                    file_index=index,
                    name=filename,
                    size=content_size,
                    status="error",
                    error="No fue posible analizar este XML.",
                )
            )
            logger.exception("Unexpected CFDI analysis failure for file_index=%s file_name=%s", index, filename)
        finally:
            await upload.close()

    artifacts = analyze_invoices(invoices, total_files=len(files), invalid_files=len(files) - len(invoices))
    duration_ms = round((time.perf_counter() - started_at) * 1000)
    logger.info(
        "CFDI analysis completed total_files=%s valid_files=%s invalid_files=%s duration_ms=%s",
        len(files),
        len(invoices),
        len(files) - len(invoices),
        duration_ms,
    )
    return AnalysisResponse(files=file_results, invoices=invoices, **artifacts.__dict__)


def parse_seed(value: str) -> int:
    try:
        return int(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="El seed debe ser un entero.") from error


async def read_estate_upload(upload: UploadFile) -> tuple[bytes, str]:
    filename = upload.filename or "estate"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".zip", ".db", ".sqlite", ".sqlite3"}:
        raise HTTPException(status_code=400, detail="El estate debe ser un archivo .zip o .db.")
    content = await upload.read(MAX_ESTATE_FILE_SIZE_BYTES + 1)
    await upload.close()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo del estate está vacío.")
    if len(content) > MAX_ESTATE_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="El estate supera el límite de 50 MB.")
    return content, suffix


@app.post("/estate/analyze")
async def analyze_estate(estate: UploadFile = File(...), seed: str = Form("0")) -> dict[str, object]:
    parsed_seed = parse_seed(seed)
    content, suffix = await read_estate_upload(estate)
    temporary_path: Path | None = None
    started_at = time.perf_counter()
    try:
        with tempfile.NamedTemporaryFile(prefix="ramrod-estate-", suffix=suffix, delete=False) as temporary_file:
            temporary_file.write(content)
            temporary_path = Path(temporary_file.name)
        run = run_estate(temporary_path, parsed_seed)
        bundle = run_bundle_payload(run)
        logger.info(
            "Estate analysis completed source_format=%s findings=%s validation_errors=%s duration_ms=%s",
            run.estate_summary["source_format"],
            len(run.findings),
            len(run.validation_errors),
            round((time.perf_counter() - started_at) * 1000),
        )
        return {
            "ok": True,
            "runId": f"RUN-{run.submission.run_metadata.input_digest[:12].upper()}",
            "runBundle": bundle,
            "caseFileHtml": case_file_html(run),
            "submission": bundle["submission"],
            "submissionValidation": bundle["submission_validation"],
        }
    except EstateLoadError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


@app.post("/estate/replay")
async def replay_estate_run(run_bundle: UploadFile = File(...)) -> dict[str, object]:
    content = await run_bundle.read(MAX_ESTATE_FILE_SIZE_BYTES + 1)
    await run_bundle.close()
    if not content or len(content) > MAX_ESTATE_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="El run bundle está vacío o supera el límite de 50 MB.")
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(prefix="ramrod-replay-", suffix=".json", delete=False) as temporary_file:
            temporary_file.write(content)
            temporary_path = Path(temporary_file.name)
        bundle = load_run_bundle(temporary_path)
        return {"ok": True, "runBundle": bundle}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)