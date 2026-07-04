#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds MomAI for all platforms (Windows native + Linux via act) and
  optionally creates a GitHub release.

.PARAMETER Version
  Override version (default: auto-detect from nearest git tag).

.PARAMETER MakeLatest
  Mark this release as the latest stable version on GitHub.
  Only use for verified stable releases. Do NOT use for pre-releases.

.PARAMETER SkipWindows
  Skip Windows build (useful when only Linux needs rebuilding).

.PARAMETER SkipLinux
  Skip Linux build (useful when only Windows needs rebuilding).

.PARAMETER Upload
  Upload artifacts and create/update a GitHub release after building.

.DESCRIPTION
  Prerequisites:
    - Docker Desktop running (for Linux build via act)
    - act CLI installed (https://github.com/nektos/act)
    - gh CLI authenticated with repo scope on WesleyQDev/MomAI-App
    - pnpm, Node.js 20

  This script orchestrates:
    1. Windows build — runs natively via `pnpm --filter momai build:exe`
    2. Linux build — runs via `act` using the release.yml workflow
    3. Artifact collection — gathers all build outputs into apps/momai/dist/
    4. (Optional) GitHub release — uploads artifacts and creates/updates release

  Usage:
    # Build all platforms (no upload):
    .\scripts\build-all.ps1

    # Build and publish as latest:
    .\scripts\build-all.ps1 -Upload -MakeLatest

    # Build only Linux, skip Windows:
    .\scripts\build-all.ps1 -SkipWindows

    # Build only Windows, skip Linux:
    .\scripts\build-all.ps1 -SkipLinux

    # Override version:
    .\scripts\build-all.ps1 -Version 1.5.2
#>
$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

# ── Step 0: Parse parameters ────────────────────────────────────
$Version = ""
$MakeLatest = $false
$SkipWindows = $false
$SkipLinux = $false
$Upload = $false
for ($i = 0; $i -lt $args.Count; $i++) {
  switch ($args[$i]) {
    '-Version'     { if ($i + 1 -lt $args.Count) { $Version = $args[$i + 1]; $i++ } }
    '-MakeLatest'  { $MakeLatest = $true }
    '-SkipWindows' { $SkipWindows = $true }
    '-SkipLinux'   { $SkipLinux = $true }
    '-Upload'      { $Upload = $true }
    '-Help'        { Get-Help $PSCommandPath -Full; exit 0 }
    default        {
      Write-Host "`u{274C} Unknown parameter: $($args[$i])" -ForegroundColor Red
      Write-Host "   Use -Help to see available options." -ForegroundColor Yellow
      exit 1
    }
  }
}

# ── Step 1: Detect version ──────────────────────────────────────
if ($Version) {
  if (-not $Version.StartsWith('v')) { $Version = "v$Version" }
} else {
  $Version = git describe --tags --abbrev=0 --exact-match 2>$null
  if (-not $Version) {
    $Version = git describe --tags --abbrev=0 2>$null
    if (-not $Version) {
      Write-Host "`u{274C} No tags found." -ForegroundColor Red
      Write-Host "   Use -Version flag or create a tag." -ForegroundColor Yellow
      exit 1
    }
    Write-Host "`u{26A0} Warning: not on exact tag (nearest: $Version)." -ForegroundColor Yellow
    $confirm = Read-Host "Build $Version anyway? (y/N)"
    if ($confirm -ne 'y') { exit 0 }
  }
}
$cleanVersion = $Version -replace '^v', ''

# ── Safety: block -MakeLatest for pre-release versions ──────────
if ($MakeLatest -and $cleanVersion -match '-') {
  Write-Host "`u{274C} Cannot mark a pre-release version as latest." -ForegroundColor Red
  Write-Host "   Version '$cleanVersion' contains '-' (pre-release pattern)." -ForegroundColor Yellow
  exit 1
}

Write-Host "`u{1F680} Building MomAI $cleanVersion" -ForegroundColor Cyan
Write-Host "   Windows: $(if ($SkipWindows) { 'SKIP' } else { 'build' })" -ForegroundColor $(if ($SkipWindows) { 'Yellow' } else { 'Green' })
Write-Host "   Linux:   $(if ($SkipLinux) { 'SKIP' } else { 'build (via act)' })" -ForegroundColor $(if ($SkipLinux) { 'Yellow' } else { 'Green' })
Write-Host "   Upload:  $(if ($Upload) { 'yes' } else { 'no' })" -ForegroundColor $(if ($Upload) { 'Green' } else { 'Yellow' })
Write-Host ""

$distDir = Join-Path $rootDir "apps" "momai" "dist"
if (-not (Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}
$artifacts = @()

# ── Step 2: Build Windows (native) ──────────────────────────────
if (-not $SkipWindows) {
  Write-Host "`u{1F5A5} Building Windows (native)..." -ForegroundColor Cyan

  # Sync version
  Push-Location "$rootDir/apps/momai"
  pnpm version $cleanVersion --no-git-tag-version --allow-same-version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Failed to sync version to package.json." -ForegroundColor Red
    exit 1
  }
  Pop-Location

  Push-Location $rootDir

  # 2a. NSIS installer (.exe)
  Write-Host "  [1/3] NSIS installer (.exe)..." -ForegroundColor Gray
  pnpm --filter momai build:exe
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Windows NSIS build failed." -ForegroundColor Red
    exit 1
  }

  # 2b. AppX store (sem certificado)
  Write-Host "  [2/3] AppX store (sem certificado)..." -ForegroundColor Gray
  pnpm --filter momai build:appx:store
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} AppX store build failed." -ForegroundColor Red
    exit 1
  }

  # 2c. AppX test (com certificado de teste)
  Write-Host "  [3/3] AppX test (certificado de teste)..." -ForegroundColor Gray
  pnpm --filter momai build:appx:test
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} AppX test build failed." -ForegroundColor Red
    exit 1
  }

  Pop-Location

  $winArtifacts = @(Get-ChildItem -Path $distDir -Recurse -Include @('*.exe','*.yml','*.blockmap') -File)
  Write-Host "  `u{2705} Windows: $($winArtifacts.Count) artifacts (.exe)" -ForegroundColor Green
  $artifacts += $winArtifacts

  # AppX builds are for Microsoft Store only — not uploaded to GitHub
  $appxArtifacts = @(Get-ChildItem -Path $distDir -Recurse -Include @('*.appx') -File)
  if ($appxArtifacts.Count -gt 0) {
    Write-Host "  `u{1F4E6} AppX: $($appxArtifacts.Count) files built (Microsoft Store only, not uploaded)" -ForegroundColor Gray
  }
}

# ── Step 3: Build Linux (via act) ───────────────────────────────
if (-not $SkipLinux) {
  Write-Host "`n`u{1F427} Building Linux (via act)..." -ForegroundColor Cyan

  # Check act is installed
  $actVersion = act --version 2>$null
  if (-not $actVersion) {
    Write-Host "`u{274C} act not found. Install from https://github.com/nektos/act" -ForegroundColor Red
    Write-Host "   winget install nektos.act" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "  Using $actVersion" -ForegroundColor Gray

  # Check Docker is running
  docker ps > $null 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Docker is not running. Start Docker Desktop first." -ForegroundColor Red
    exit 1
  }

  # Set the tag so the workflow can read it
  $env:GITHUB_REF = "refs/tags/$Version"
  $env:GITHUB_SHA = (git rev-parse HEAD)

  # Run the build-linux job from release.yml via act
  # --pull never: use local image if available
  # --bind: mount workspace into container
  act workflow_dispatch `
    --workflow release.yml `
    --job build-linux `
    --repo-path $rootDir `
    --bind `
    --pull never `
    --env GITHUB_REF="refs/tags/$Version" 2>&1 | ForEach-Object { Write-Host "  $_" }

  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Linux build failed (via act)." -ForegroundColor Red
    Write-Host "   Check act logs above for details." -ForegroundColor Yellow
    exit 1
  }

  # Act downloads artifacts into the workflow run, but for local use
  # we need to extract them. The build-linux job uploads to actions/upload-artifact,
  # which act stores locally. Let's find them.
  $actArtifacts = @(Get-ChildItem -Path $distDir -Recurse -Include @('*.AppImage','*.deb') -File -ErrorAction SilentlyContinue)
  if ($actArtifacts.Count -eq 0) {
    # act stores artifacts in /tmp/act artifacts or .act/artifacts
    $actArtifactDir = Join-Path $rootDir ".act" "artifacts"
    if (Test-Path $actArtifactDir) {
      Get-ChildItem -Path $actArtifactDir -Recurse -Include @('*.AppImage','*.deb','*.yml','*.blockmap') | ForEach-Object {
        Copy-Item $_.FullName -Destination $distDir -Force
      }
      $actArtifacts = @(Get-ChildItem -Path $distDir -Recurse -Include @('*.AppImage','*.deb') -File)
    }
  }

  Write-Host "  `u{2705} Linux: $($actArtifacts.Count) artifacts" -ForegroundColor Green
  $artifacts += $actArtifacts
}

# ── Step 4: Summary ─────────────────────────────────────────────
Write-Host "`n`u{1F4CB} Build Summary" -ForegroundColor Cyan
$allArtifacts = @(Get-ChildItem -Path $distDir -Recurse -Include @('*.exe','*.AppImage','*.deb','*.yml','*.blockmap') -File)
if ($allArtifacts.Count -eq 0) {
  Write-Host "`u{274C} No artifacts found in $distDir" -ForegroundColor Red
  exit 1
}
Write-Host "  $($allArtifacts.Count) artifacts in $distDir" -ForegroundColor Green
$allArtifacts | ForEach-Object { Write-Host "    $($_.Name) ($([math]::Round($_.Length / 1MB, 1)) MB)" -ForegroundColor Gray }

# ── Step 5: Upload to GitHub (optional) ─────────────────────────
if (-not $Upload) {
  Write-Host "`n`u{26A0}  Artifacts ready but NOT uploaded. Use -Upload to publish." -ForegroundColor Yellow
  Write-Host "   To publish later:" -ForegroundColor Yellow
  Write-Host "   .\scripts\release.ps1 -Version $cleanVersion$(if ($MakeLatest) { ' -MakeLatest' })" -ForegroundColor Yellow
  exit 0
}

Write-Host "`n`u{1F4E4} Uploading to GitHub..." -ForegroundColor Cyan

$paths = $allArtifacts | ForEach-Object { $_.FullName }
$created = $false
$releaseArgs = @(
  'release', 'create', $Version,
  '--repo', 'WesleyQDev/MomAI-App',
  '--title', "MomAI $Version",
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
} elseif ($output -match 'already_exists') {
  Write-Host "  Release already exists, uploading additional artifacts..." -ForegroundColor Yellow
} else {
  Write-Host "`u{274C} Failed to create release." -ForegroundColor Red
  Write-Host $output
  exit 1
}

if (-not $created) {
  gh release upload $Version --repo WesleyQDev/MomAI-App --clobber $paths 2>&1 | Out-String | Write-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Upload failed." -ForegroundColor Red
    exit 1
  }
}

if ($MakeLatest -and -not $created) {
  Write-Host "  Ensuring release is marked as latest..." -ForegroundColor Yellow
  gh release edit $Version --repo WesleyQDev/MomAI-App --latest 2>&1 | Out-String | Write-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`u{274C} Failed to mark as latest." -ForegroundColor Red
    exit 1
  }
}

Write-Host "`u{2705} Release $Version completed!" -ForegroundColor Green
if (-not $MakeLatest) {
  Write-Host "`u{26A0}  This release is NOT marked as latest." -ForegroundColor Yellow
  Write-Host "   To mark as latest, run:" -ForegroundColor Yellow
  Write-Host "   gh release edit $Version --repo WesleyQDev/MomAI-App --latest" -ForegroundColor Yellow
}
