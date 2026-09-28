#!/usr/bin/env pwsh
<#
.SYNOPSIS
  KOMO one-command local deploy script (Windows PowerShell / pwsh).

.DESCRIPTION
  Build local code into production artifacts -> tar -> scp to server -> ssh restart systemd -> verify.
  Purely local-driven, reuses your existing SSH. No server changes, no CI/CD.
  Only needs Windows built-in tar / scp / ssh (OpenSSH) plus local node / npm / mvn.
  ASCII-only on purpose: avoids CJK encoding/GBK mojibake across PowerShell versions.

.EXAMPLE
  .\deploy\deploy.ps1 frontend     # deploy frontend only
  .\deploy\deploy.ps1 backend      # deploy backend only
  .\deploy\deploy.ps1 all          # deploy both (default)
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('frontend', 'backend', 'all')]
  [string]$Target = 'all'
)

$ErrorActionPreference = 'Stop'

# ============================================================
#  CONFIG - edit here once
# ============================================================
#  Your SSH target: user@server-ip. DEPLOY.md uses 'ubuntu'; change if needed.
$SshTarget  = 'ubuntu@43.142.82.207'

#  Project root on the server (DEPLOY.md convention: /opt/komo)
$RemoteRoot = '/opt/komo'

#  Remote web dir / remote JAR path (usually no need to change)
$RemoteWebDir  = "$RemoteRoot/KOMO/frontend/packages/web"
$RemoteJarPath = "$RemoteRoot/komo-backend.jar"

#  Backend fat JAR name (= artifactId-version, see pom.xml)
$JarName = 'komo-backend-0.1.0.jar'
# ============================================================

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot 'KOMO/backend'
$WebDir     = Join-Path $RepoRoot 'KOMO/frontend/packages/web'
$FrontRoot  = Join-Path $RepoRoot 'KOMO/frontend'

function Assert-Ok([string]$what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}

function Write-Step([string]$msg) {
  Write-Host ''
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Deploy-Frontend {
  $tar = Join-Path $WebDir 'komo-frontend.tar.gz'

  Write-Step 'Build frontend (local next build)'
  Push-Location $WebDir
  try {
    # 1. Write production env with explicit LF (no CR), so NEXT_PUBLIC_API_URL never gets a trailing \r
    [IO.File]::WriteAllText((Join-Path $WebDir '.env.production'), "NEXT_PUBLIC_API_URL=/api`n")

    # 2. Install deps (at workspace root, NOT packages/web)
    Push-Location $FrontRoot
    npm install
    Assert-Ok 'npm install'
    Pop-Location

    # 3. Build
    npx next build
    Assert-Ok 'next build'

    # 4. Fill in static assets standalone omits (skip = blank page + all assets 404)
    $saWeb     = Join-Path $WebDir '.next/standalone/packages/web'
    $dstStatic = Join-Path $saWeb  '.next/static'
    $dstPublic = Join-Path $saWeb  'public'
    if (Test-Path $dstStatic) { Remove-Item -Recurse -Force $dstStatic }
    if (Test-Path $dstPublic) { Remove-Item -Recurse -Force $dstPublic }
    Copy-Item -Recurse -Force '.next/static' $dstStatic
    Copy-Item -Recurse -Force 'public'       $dstPublic

    # 5. Pack the whole standalone (tar holds standalone/...; extracting into remote .next/ restores layout)
    if (Test-Path $tar) { Remove-Item -Force $tar }
    tar -czf $tar -C '.next' 'standalone'
    Assert-Ok 'tar pack frontend'
  } finally {
    Pop-Location
  }

  Write-Step 'Upload frontend artifact (scp - will prompt for SSH password)'
  scp $tar "${SshTarget}:/tmp/komo-frontend.tar.gz"
  Assert-Ok 'scp frontend artifact'

  Write-Step 'Extract + restart komo-frontend on server (ssh - prompts SSH password, maybe sudo password)'
  $remote = @"
set -e
mkdir -p '$RemoteWebDir/.next'
rm -rf '$RemoteWebDir/.next/standalone'
tar -xzf /tmp/komo-frontend.tar.gz -C '$RemoteWebDir/.next'
rm -f /tmp/komo-frontend.tar.gz
sudo systemctl restart komo-frontend
sleep 2
systemctl is-active komo-frontend
curl -s -o /dev/null -w 'front http %{http_code}\n' http://localhost:3000
"@
  $remote = $remote -replace "\r", ''   # strip CR: Windows CRLF would leak \r into remote bash
  ssh -t $SshTarget $remote
  Assert-Ok 'ssh frontend deploy'

  Remove-Item -Force $tar -ErrorAction SilentlyContinue
}

function Deploy-Backend {
  Write-Step 'Build backend fat JAR (local mvn package)'
  Push-Location $BackendDir
  try {
    mvn clean package -DskipTests -q
    Assert-Ok 'mvn package'
  } finally {
    Pop-Location
  }

  $localJar = Join-Path $BackendDir "target/$JarName"
  if (-not (Test-Path $localJar)) { throw "Build artifact not found: $localJar" }

  Write-Step 'Upload backend JAR (scp - will prompt for SSH password)'
  scp $localJar "${SshTarget}:$RemoteJarPath"
  Assert-Ok 'scp backend JAR'

  Write-Step 'Restart komo-backend (ssh - prompts SSH password, maybe sudo password)'
  $remote = @"
set -e
sudo systemctl restart komo-backend
sleep 3
systemctl is-active komo-backend
curl -s -o /dev/null -w 'backend http %{http_code}\n' http://localhost:8081/api/health
"@
  $remote = $remote -replace "\r", ''   # strip CR: Windows CRLF would leak \r into remote bash
  ssh -t $SshTarget $remote
  Assert-Ok 'ssh backend deploy'
}

# ---------------------------- main ----------------------------
Write-Host "KOMO deploy  Target=$Target  SSH=$SshTarget" -ForegroundColor Green
if ($SshTarget -like '*YOUR_SERVER_IP*') {
  throw 'Set $SshTarget at the top CONFIG section to your  user@server-ip  first.'
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
switch ($Target) {
  'frontend' { Deploy-Frontend }
  'backend'  { Deploy-Backend }
  'all'      { Deploy-Frontend; Deploy-Backend }
}
$sw.Stop()

Write-Host ''
Write-Host ("Deploy finished in {0}s." -f [math]::Round($sw.Elapsed.TotalSeconds, 1)) -ForegroundColor Green
