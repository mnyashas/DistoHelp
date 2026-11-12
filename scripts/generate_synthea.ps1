#!/usr/bin/env pwsh
# Regenerate the 5 demo patients with REAL Synthea (Java 17+ required).
$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "synthea"
New-Item -ItemType Directory -Force $dir | Out-Null
$jar = Join-Path $dir "synthea-with-dependencies.jar"
if (-not (Test-Path $jar)) {
  Write-Host "Downloading Synthea (~188 MB)..."
  Invoke-WebRequest -Uri "https://github.com/synthetichealth/synthea/releases/download/master-branch-latest/synthea-with-dependencies.jar" -OutFile $jar -UseBasicParsing
}
Push-Location $dir
Write-Host "Generating 300 synthetic patients (FHIR R4 bundles)..."
java -Xmx2g -jar $jar -p 300 --exporter.fhir.export=true --exporter.hospital.fhir.export=false --exporter.csv.export=false India
Pop-Location
Write-Host "Converting into the DIstoHelp registry..."
python (Join-Path $PSScriptRoot "import_synthea.py")
Write-Host "Done. backend/app/seed_data/synthea_patients.json is now used by the seeder."
