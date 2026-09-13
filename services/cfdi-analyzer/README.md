# RamRod CFDI Analyzer

Servicio FastAPI aislado para validar, leer y analizar XML CFDI sin acceder a MongoDB, MCP ni servicios externos. Procesa cada archivo de forma independiente, por lo que un XML inválido no descarta los resultados válidos de la misma solicitud.

## Requisitos

- Python 3.10 o superior
- Entorno virtual de Python

## Ejecución local

Desde `services/cfdi-analyzer`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

En macOS o Linux, activa el entorno con `source .venv/bin/activate`.

Configura el proceso de Next.js con:

```text
CFDI_ANALYZER_URL=http://127.0.0.1:8001
```

La integración de despliegue de este servicio queda deliberadamente fuera de esta fase.

## Endpoints

```text
GET  http://127.0.0.1:8001/health
POST http://127.0.0.1:8001/analyze
POST http://127.0.0.1:8001/estate/analyze
POST http://127.0.0.1:8001/estate/replay
```

## Forensic estate audit

The same service also hosts RamRod's offline deterministic estate engine. It accepts either the official `estate_csv.zip` or `estate.db` schema through `POST /estate/analyze`, with multipart fields `estate` and optional integer `seed`. The response contains an official-format submission, a replay bundle, a self-contained case-file HTML document, and an internal validation status.

Run it without a browser or network dependency:

```powershell
python forensic_cli.py --estate C:\path\estate_csv.zip --seed 201 --output .\run-output
```

Each completed CLI run writes `submission.json`, `case_file.html`, `run_bundle.json`, `audit_log.json`, and `config_snapshot.json`. MCP and an LLM are not used to make official findings.

Ejemplo de health:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

Ejemplo de análisis:

```powershell
curl.exe -F "files=@.\factura.xml" http://127.0.0.1:8001/analyze
```

El endpoint acepta como máximo 20 XML por solicitud y 10 MB por archivo. Rechaza XML vacío, archivos sin extensión `.xml`, estructuras `DOCTYPE` o `ENTITY`, y XML malformado. El parser usa `defusedxml`, no resuelve entidades externas ni descarga esquemas.

## Pruebas manuales

Prueba los siguientes escenarios usando XML CFDI autorizados para tu entorno:

1. Un XML válido: debe regresar una factura, entidades, evidencia y métricas.
2. Varios XML válidos: debe crear relaciones de facturación y agregar totales por moneda sin mezclarlas.
3. XML corrupto: debe regresar un elemento de archivo con `status: error` y permitir los demás resultados.
4. Archivo no XML, vacío o mayor a 10 MB: debe regresar un error controlado.
5. XML sin UUID: debe generar `MISSING_FISCAL_STAMP` como señal informativa.
6. Dos XML con el mismo UUID: debe generar `DUPLICATE_UUID`.
7. Facturas similares de la misma pareja comercial: puede generar `POSSIBLE_DUPLICATE_INVOICE` o `REPETITIVE_BILLING_PATTERN` según los datos.
8. Facturas con varias empresas o monedas: debe deduplicar entidades por RFC y separar los totales por moneda.

Las relaciones generadas representan facturación declarada en CFDI, nunca transferencias bancarias o movimientos reales de dinero.