#!/usr/bin/env pwsh
# Download BIDMC Numerics CSVs (PhysioNet bidmc 1.0.0, open access).
$ErrorActionPreference = "Stop"
$dest = Join-Path (Split-Path -Parent $PSScriptRoot) "data\bidmc"
New-Item -ItemType Directory -Force $dest | Out-Null
for ($i = 1; $i -le 53; $i++) {
  $n = "{0:D2}" -f $i
  $url = "https://physionet.org/files/bidmc/1.0.0/bidmc_csv/bidmc_${n}_Numerics.csv"
  $out = Join-Path $dest "bidmc_${n}_Numerics.csv"
  Write-Host "[$i/53] $url"
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 60
}
Write-Host "Done. Set BIDMC_DIR=$dest (default) and use /api/bidmc/records."
