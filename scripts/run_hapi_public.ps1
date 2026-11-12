#!/usr/bin/env pwsh
# Start the backend against the PUBLIC HAPI FHIR R4 sandbox (no Docker/Java needed).
# Use only when this machine cannot run docker-compose. Data is public test data.
$ErrorActionPreference = "Stop"
$env:HAPI_FHIR_URL = "https://hapi.fhir.org/baseR4"
Set-Location (Join-Path $PSScriptRoot "..\backend")
Write-Host "HAPI_FHIR_URL=$env:HAPI_FHIR_URL (public sandbox)"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
