#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds MomAI for Windows (native) and Linux (Docker), then uploads
  all artifacts to https://github.com/WesleyQDev/MomAI-App as a release.

.PARAMETER Version
  Override version (default: auto-detect from nearest git tag).

.PARAMETER MakeLatest
  Mark this release as the latest stable version on GitHub.
  Only use for verified stable releases. Do NOT use for pre-releases or betas.

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

    # Mark as latest stable:
    .\scripts\release.ps1 -Version 1.5.0 -MakeLatest

    # Pre-release (do NOT use -MakeLatest):
    .\scripts\release.ps1 -Version 1.6.0-beta.1
#>
$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

# ── Step 0: Parse parameters ────────────────────────────────────
$Version = ""
$MakeLatest = $false
for ($i = 0; $i -lt $args.Count; $i++) {
  if ($args[$i] -eq '-Version' -and ($i + 1) -lt $args.Count) { $Version = $args[$i + 1] }
  if ($args[$i] -eq '-MakeLatest') { $MakeLatest = $true }
}
if ($Version) {
  if (-not $Version.StartsWith('v')) { $Version = "v$Version" }
  $version = $Version
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

# ── Safety: block -MakeLatest for pre-release versions ──────────
if ($MakeLatest -and $cleanVersion -match '-') {
  Write-Host "`u{274C} Cannot mark a pre-release version as latest." -ForegroundColor Red
  Write-Host "   Version '$cleanVersion' contains '-' (pre-release pattern)." -ForegroundColor Yellow
  Write-Host "   Remove -MakeLatest or use a stable version (e.g. 1.5.1)." -ForegroundColor Yellow
  exit 1
}

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
Write-Host "[3/5] Building Linux (Docker build + container)..."
docker build -f "$rootDir/scripts/Dockerfile.linux" `
  -t momai-linux-builder `
  --build-arg "VERSION=$cleanVersion" `
  "$rootDir"
if ($LASTEXITCODE -ne 0) { throw "Docker build failed" }

Write-Host "[4/5] Extracting Linux artifacts..."
$distDir = Join-Path $rootDir "apps" "momai" "dist"
docker rm -f momai-temp 2>$null | Out-Null
$containerId = docker create --name momai-temp momai-linux-builder 2>&1 | Out-String
$containerId = $containerId.Trim()
docker cp "${containerId}:/app/apps/momai/dist/." "${distDir}\" 2>&1 | Out-String | Write-Host
if ($LASTEXITCODE -ne 0) { Write-Host "  docker cp had issues, continuing..." -ForegroundColor Yellow }
docker rm $containerId | Out-Null
Write-Host "  Artifacts extracted to $distDir"

# ── Cleanup: remove Linux-only files downloaded by Docker hydrate ─
foreach ($p in @("$rootDir/apps/momai/bin/llama", "$rootDir/apps/momai/bin/python/linux")) {
  if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
}

# ── Step 5: Collect and upload ──────────────────────────────────
Write-Host "[5/5] Uploading to WesleyQDev/MomAI-App..."
$artifacts = @(Get-ChildItem -Path $distDir -Include @('*.exe','*.AppImage','*.deb','*.yml','*.blockmap') -File)
if ($artifacts.Count -eq 0) {
  Write-Host "`u{274C} No artifacts found in $distDir" -ForegroundColor Red
  Write-Host "  Contents:"
  Get-ChildItem $distDir | ForEach-Object { Write-Host "    $($_.Name)" }
  exit 1
}
Write-Host "  Artifacts:" ($artifacts | ForEach-Object { "`n    $($_.Name)" })
$paths = $artifacts | ForEach-Object { $_.FullName }

$created = $false
$releaseArgs = @(
  'release', 'create', $version,
  '--repo', 'WesleyQDev/MomAI-App',
  '--title', "MomAI $version",
  '--notes', "Release automático local."
)
if ($MakeLatest) {
  $releaseArgs += '--latest'
  Write-Host "  Marking as latest stable release" -ForegroundColor Green
} else {
  Write-Host "  NOT marking as latest (use -MakeLatest for stable releases)" -ForegroundColor Yellow
}
$releaseArgs += $paths

$output = & gh @releaseArgs 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
  $created = $true
  Write-Host $output
} else {
  Write-Host "  Release already exists, uploading additional artifacts..." -ForegroundColor Yellow
  Write-Host $output
}

if (-not $created) {
  gh release upload $version --repo WesleyQDev/MomAI-App --clobber $paths 2>&1 | Out-String | Write-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Upload failed." -ForegroundColor Red
    exit 1
  }
}

# If -MakeLatest was requested but release already existed, ensure it's marked as latest
if ($MakeLatest -and -not $created) {
  Write-Host "  Ensuring release is marked as latest..." -ForegroundColor Yellow
  gh release edit $version --repo WesleyQDev/MomAI-App --latest 2>&1 | Out-String | Write-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Failed to mark as latest." -ForegroundColor Red
    exit 1
  }
}

Write-Host "`u{2705} Release $version completed!" -ForegroundColor Green
if (-not $MakeLatest) {
  Write-Host "`u{26A0}  This release is NOT marked as latest." -ForegroundColor Yellow
  Write-Host "   To mark as latest, run:" -ForegroundColor Yellow
  Write-Host "   gh release edit $version --repo WesleyQDev/MomAI-App --latest" -ForegroundColor Yellow
}
