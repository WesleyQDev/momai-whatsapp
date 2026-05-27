#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds MomAI for Windows (native) and Linux (Docker), then uploads
  all artifacts to https://github.com/WesleyQDev/MomAI-App as a release.

.PARAMETER Version
  Override version (default: auto-detect from nearest git tag).

.DESCRIPTION
  Prerequisites:
    - Docker Desktop running (for Linux build)
    - gh CLI authenticated with repo scope on WesleyQDev/MomAI-App
    - pnpm, Node.js 20

  Usage:
    # Auto-detect from tag:
    git tag v1.5.0
    .\scripts\release.ps1

    # Override version:
    .\scripts\release.ps1 -Version 1.5.0
#>
param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

# ── Step 0: Detect version ──────────────────────────────────────
if ($Version) {
  $version = $Version
  if (-not $version.StartsWith('v')) { $version = "v$version" }
  Write-Host "`u{1F4E6} Releasing $version (manual override)"
} else {
  $version = git describe --tags --abbrev=0 --exact-match 2>$null
  if (-not $version) {
    $version = git describe --tags --abbrev=0 2>$null
    if (-not $version) {
      Write-Host "`u{274C} No tags found." -ForegroundColor Red
      Write-Host "   Use -Version flag or create a tag." -ForegroundColor Yellow
      exit 1
    }
    Write-Host "`u{26A0} Warning: not on exact tag (nearest: $version)." -ForegroundColor Yellow
    $confirm = Read-Host "Release $version anyway? (y/N)"
    if ($confirm -ne 'y') { exit 0 }
  }
}
$cleanVersion = $version -replace '^v', ''
Write-Host "`u{1F680} Releasing $version"

# ── Step 1: Ensure Docker is running ─────────────────────────────
Write-Host "`n`u{1F4E6} Checking Docker..."
docker ps > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "  Docker not responding, starting Docker Desktop..."
  $dockerPath = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerPath) {
    Start-Process $dockerPath
    Write-Host "  Waiting for Docker daemon (up to 120s)..."
    $dockerReady = $false
    $waited = 0
    while ($waited -lt 120) {
      Start-Sleep -Seconds 3
      $waited += 3
      docker ps > $null 2>&1
      if ($LASTEXITCODE -eq 0) {
        $dockerReady = $true
        Write-Host "  Docker ready after ${waited}s"
        break
      }
      Write-Host "  still waiting (${waited}s)..."
    }
    if (-not $dockerReady) {
      Write-Host "`u{274C} Docker did not start in time." -ForegroundColor Red
      Write-Host "   Start Docker Desktop manually and try again." -ForegroundColor Yellow
      exit 1
    }
  } else {
    Write-Host "`u{274C} Docker Desktop not found at $dockerPath" -ForegroundColor Red
    Write-Host "   Install from https://docs.docker.com/desktop/setup/install/windows-install/" -ForegroundColor Yellow
    exit 1
  }
}

# ── Step 2: Sync version to apps/momai/package.json ─────────────
Write-Host "`n[1/5] Syncing version..."
Push-Location "$rootDir/apps/momai"
pnpm version $cleanVersion --no-git-tag-version --allow-same-version | Out-Null
Pop-Location

# ── Step 3: Build Windows ───────────────────────────────────────
Write-Host "[2/5] Building Windows (native)..."
Push-Location "$rootDir"
pnpm --filter momai build:win
if ($LASTEXITCODE -ne 0) { throw "Windows build failed" }
Pop-Location

# ── Step 4: Build Linux (Docker) ────────────────────────────────
Write-Host "[3/5] Building Linux builder image..."
docker build -f "$rootDir/scripts/Dockerfile.linux" -t momai-linux-builder "$rootDir" 2>&1 | Out-Null

Write-Host "[4/5] Building Linux (Docker container)..."
docker run --rm `
  -v "${rootDir}:/workspace" `
  -w /workspace `
  momai-linux-builder `
  bash -c @"
set -e
echo '[container] Fixing CRLF in shell scripts (Windows -> Linux compat)...'
find /workspace -name '*.sh' -exec dos2unix {} + 2>/dev/null || true
echo '[container] Installing Linux dependencies...'
pnpm install --no-frozen-lockfile --store-dir /tmp/pnpm-store 2>&1 | tail -5
echo '[container] Building Linux...'
pnpm --filter momai build:linux 2>&1
echo '[container] Done.'
"@
if ($LASTEXITCODE -ne 0) { throw "Linux build failed" }

# ── Step 5: Collect and upload ──────────────────────────────────
Write-Host "[5/5] Uploading to WesleyQDev/MomAI-App..."
$distDir = "$rootDir/apps/momai/dist"
$artifacts = @(Get-ChildItem -Path $distDir -Include @('*.exe','*.AppImage','*.deb','*.yml','*.blockmap') -File)
if ($artifacts.Count -eq 0) {
  Write-Host "`u{274C} No artifacts found in $distDir" -ForegroundColor Red
  exit 1
}
Write-Host "  Artifacts:" ($artifacts | ForEach-Object { "`n    $($_.Name)" })
$paths = $artifacts | ForEach-Object { $_.FullName }

$created = $false
try {
  gh release create $version `
    --repo WesleyQDev/MomAI-App `
    --title "MomAI $version" `
    --latest `
    --notes "Release automático local." `
    $paths 2>&1 | Out-String | Write-Host
  $created = $true
} catch {
  Write-Host "  Release already exists, uploading additional artifacts..."
}

if (-not $created) {
  gh release upload $version --repo WesleyQDev/MomAI-App --clobber $paths 2>&1 | Out-String | Write-Host
}

Write-Host "`u{2705} Release $version completed!" -ForegroundColor Green
