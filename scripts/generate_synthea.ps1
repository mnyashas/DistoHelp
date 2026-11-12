#!/usr/bin/env pwsh
# Regenerate the 5 discharge profiles with real Synthea (Java 17+ required).
# https://synthetichealth.github.io/synthea/
$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "synthea"
New-Item -ItemType Directory -Force $dir | Out-Null
$jar = Join-Path $dir "shaded.jar"
if (-not (Test-Path $jar)) {
  Write-Host "Downloading Synthea shaded jar (~100 MB)..."
  Invoke-WebRequest -Uri "https://github.com/synthetichealth/synthea/releases/download/v3.3.0/synthea-with-dependencies.jar" -OutFile $jar -UseBasicParsing
}
Push-Location $dir
java -jar $jar -p 50 --exporter.fhir.export=true --exporter.csv.export=true --exporter.hospital.fhir.export=true India
Pop-Location
Write-Host "Synthea output in $dir\output\fhir (copy 5 bundles into backend/app/seed_data/ and adjust app/seed.py)"
Write-Host "Note: the repo ships curated profiles matching Synthea's FHIR output shape; this script regenerates."
