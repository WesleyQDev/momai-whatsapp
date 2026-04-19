# Automation to prepare the portable binaries for MomAI build
Set-Location $PSScriptRoot
$binDir = Join-Path (Join-Path $PSScriptRoot "..") "bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir }

# Kill any running uv processes to avoid "File in use" errors
Get-Process "uv" -ErrorAction SilentlyContinue | Stop-Process -Force

# Helper: retry Remove-Item for locked files
function Remove-WithRetry {
    param([string]$Path, [int]$MaxRetries = 5, [int]$DelayMs = 1000)
    for ($i = 0; $i -lt $MaxRetries; $i++) {
        try {
            Remove-Item -Recurse -Force $Path -ErrorAction Stop
            return $true
        } catch {
            Write-Host "[MomAI] File locked, retrying in $($DelayMs)ms... ($($i+1)/$MaxRetries)" -ForegroundColor Yellow
            Start-Sleep -Milliseconds $DelayMs
        }
    }
    Write-Warning "[MomAI] Could not remove $Path after $MaxRetries retries"
    return $false
}

# 1. Download UV (skip if already present)
$uvExe = Join-Path $binDir "uv.exe"
if (Test-Path $uvExe) {
    Write-Host "[MomAI] UV already present, skipping download." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Downloading UV..." -ForegroundColor Cyan
    $uvUrl = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip"
    $uvZip = Join-Path $binDir "uv.zip"
    try {
        Get-ChildItem $binDir -Filter "uv*.exe" | Remove-Item -Force -ErrorAction SilentlyContinue

        curl.exe -L $uvUrl -o "$uvZip"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }

        Expand-Archive -Path $uvZip -DestinationPath $binDir -Force
        Remove-Item $uvZip -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "[MomAI] Failed to download or extract UV: $($_.Exception.Message)"
    }
}

# 2. Download Portable Python (skip if already present)
$targetPython = Join-Path $binDir "python"
$pythonExe = Join-Path $targetPython "python.exe"
if (Test-Path $pythonExe) {
    Write-Host "[MomAI] Python already present, skipping download." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Downloading Portable Python 3.12..." -ForegroundColor Cyan
    $pyUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8%2B20250115-x86_64-pc-windows-msvc-shared-install_only.tar.gz"
    $pyTar = Join-Path $binDir "python.tar.gz"

    try {
        curl.exe -L $pyUrl -o "$pyTar"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }
    } catch {
        Write-Error "[MomAI] Failed to download Python. URL: $pyUrl"
        return
    }

    Write-Host "[MomAI] Extracting Python..." -ForegroundColor Cyan
    $pyExtractDir = Join-Path $binDir "python_raw"
    if (Test-Path $pyExtractDir) { Remove-WithRetry $pyExtractDir }
    New-Item -ItemType Directory -Path $pyExtractDir | Out-Null

    # Use native tar.exe
    tar -xzf "$pyTar" -C "$pyExtractDir"
    Remove-Item $pyTar -ErrorAction SilentlyContinue

    # Move the actual python folder to bin/python
    $extractedPath = Join-Path $pyExtractDir "python"

    if (Test-Path $extractedPath) {
        if (Test-Path $targetPython) { Remove-WithRetry $targetPython }
        Move-Item -Path $extractedPath -Destination $targetPython -Force
        Write-Host "[MomAI] Python ready in $targetPython" -ForegroundColor Green
    } else {
        Write-Error "[MomAI] Extraction failed: $extractedPath not found."
        Get-ChildItem "$pyExtractDir"
    }

    Remove-Item -Recurse -Force $pyExtractDir -ErrorAction SilentlyContinue
}

# 3. Download Visual C++ Redistributable (skip if already present)
$vcExe = Join-Path $binDir "vc_redist.x64.exe"
if (Test-Path $vcExe) {
    Write-Host "[MomAI] VC Redist already present, skipping download." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Downloading Visual C++ Redistributable..." -ForegroundColor Cyan
    $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    try {
        curl.exe -L $vcUrl -o "$vcExe"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }
        Write-Host "[MomAI] VC Redist ready in $vcExe" -ForegroundColor Green
    } catch {
        Write-Warning "[MomAI] Failed to download VC Redist: $($_.Exception.Message)"
    }
}

Write-Host "[MomAI] Hydration complete! UV, Python and VC Redist are ready in apps/momai/bin" -ForegroundColor Green

# 4. Download llama.cpp runtime binaries for Windows (CPU + Vulkan)
$llamaDir = Join-Path $binDir "llama"
$cpuDir = Join-Path $llamaDir "cpu"
$vulkanDir = Join-Path $llamaDir "vulkan"
$cpuExe = Join-Path $cpuDir "llama-server.exe"
$vulkanExe = Join-Path $vulkanDir "llama-server.exe"
$forceHydrate = [string]::Equals($env:MOMAI_FORCE_HYDRATE, "1")

if (-not $forceHydrate -and (Test-Path $cpuExe) -and (Test-Path $vulkanExe)) {
    Write-Host "[MomAI] Reusing cached llama.cpp Windows binaries." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Preparing llama.cpp Windows binaries..." -ForegroundColor Cyan

    function Expand-LlamaZip {
        param(
            [string]$ZipPath,
            [string]$TargetDir
        )

        $tmpExtract = Join-Path $binDir (".llama-extract-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $tmpExtract | Out-Null

        try {
            Expand-Archive -Path $ZipPath -DestinationPath $tmpExtract -Force

            $server = Get-ChildItem -Path $tmpExtract -Filter "llama-server.exe" -Recurse -File | Select-Object -First 1
            if (-not $server) {
                throw "llama-server.exe not found inside $ZipPath"
            }

            $sourceDir = $server.Directory.FullName
            if (Test-Path $TargetDir) { Remove-WithRetry $TargetDir | Out-Null }
            New-Item -ItemType Directory -Path $TargetDir | Out-Null
            Copy-Item -Path (Join-Path $sourceDir "*") -Destination $TargetDir -Recurse -Force
        } finally {
            if (Test-Path $tmpExtract) { Remove-WithRetry $tmpExtract | Out-Null }
        }
    }

    $llamaVersion = $env:MOMAI_LLAMA_VERSION
    if ([string]::IsNullOrWhiteSpace($llamaVersion)) {
        try {
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
            $llamaVersion = [string]$release.tag_name
        } catch {
            throw "[MomAI] Could not determine latest llama.cpp tag: $($_.Exception.Message)"
        }
    }

    if ([string]::IsNullOrWhiteSpace($llamaVersion)) {
        throw "[MomAI] Could not resolve llama.cpp version tag."
    }

    $cpuAsset = "llama-$llamaVersion-bin-win-cpu-x64.zip"
    $vulkanAsset = "llama-$llamaVersion-bin-win-vulkan-x64.zip"
    $llamaBaseUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$llamaVersion"

    $cpuZip = Join-Path $binDir $cpuAsset
    $vulkanZip = Join-Path $binDir $vulkanAsset

    try {
        Write-Host "[MomAI] Downloading llama CPU build: $cpuAsset" -ForegroundColor Cyan
        curl.exe -fL "$llamaBaseUrl/$cpuAsset" -o "$cpuZip"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed downloading $cpuAsset (exit $LASTEXITCODE)" }
        Expand-LlamaZip -ZipPath $cpuZip -TargetDir $cpuDir

        Write-Host "[MomAI] Downloading llama Vulkan build: $vulkanAsset" -ForegroundColor Cyan
        curl.exe -fL "$llamaBaseUrl/$vulkanAsset" -o "$vulkanZip"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed downloading $vulkanAsset (exit $LASTEXITCODE)" }
        Expand-LlamaZip -ZipPath $vulkanZip -TargetDir $vulkanDir
    } finally {
        if (Test-Path $cpuZip) { Remove-Item $cpuZip -Force -ErrorAction SilentlyContinue }
        if (Test-Path $vulkanZip) { Remove-Item $vulkanZip -Force -ErrorAction SilentlyContinue }
    }

    if (-not (Test-Path $cpuExe) -or -not (Test-Path $vulkanExe)) {
        throw "[MomAI] llama-server.exe missing after extraction."
    }

    Write-Host "[MomAI] llama.cpp Windows binaries ready (tag: $llamaVersion)" -ForegroundColor Green
}

# 5. Download dependency wheels for offline installation
$wheelsDir = Join-Path $binDir "wheels"
$wheelsReadyMarker = Join-Path $wheelsDir "offline-ready.marker"
$coreDir = Join-Path (Join-Path $PSScriptRoot "..") "..\core"
$lockFile = Join-Path $binDir "requirements-win.lock"
$pyprojectFile = Join-Path $coreDir "pyproject.toml"

Write-Host "[MomAI] Generating lockfile for Windows..." -ForegroundColor Cyan
Write-Host "[MomAI] Core dir: $coreDir" -ForegroundColor Gray
& $uvExe pip compile "$pyprojectFile" `
    --python-version 3.12 `
    --python-platform windows `
    --output-file "$lockFile" 2>&1 | ForEach-Object { Write-Host "  $_" }

if ($LASTEXITCODE -ne 0) {
    Write-Warning "[MomAI] Failed to generate lockfile. Wheels will not be cached."
} else {
    if (Test-Path $wheelsDir) { Remove-WithRetry $wheelsDir | Out-Null }
    New-Item -ItemType Directory -Path $wheelsDir | Out-Null

    if (Test-Path $wheelsReadyMarker) {
        Remove-Item $wheelsReadyMarker -Force -ErrorAction SilentlyContinue
    }

    Write-Host "[MomAI] Downloading dependency wheels..." -ForegroundColor Cyan
    & $pythonExe -m pip download `
        -d "$wheelsDir" `
        -r "$lockFile" `
        --only-binary :all: `
        --platform win_amd64 `
        --python-version 3.12 `
        --implementation cp `
        --quiet 2>&1 | ForEach-Object { Write-Host "  $_" }
    $depsDownloadExitCode = $LASTEXITCODE

    # Also download build-system dependencies (setuptools, wheel) for fully offline builds
    Write-Host "[MomAI] Downloading build-system wheels..." -ForegroundColor Cyan
    & $pythonExe -m pip download `
        -d "$wheelsDir" `
        "setuptools>=69" "wheel" `
        --only-binary :all: `
        --python-version 3.12 `
        --quiet 2>&1 | ForEach-Object { Write-Host "  $_" }
    $buildDepsDownloadExitCode = $LASTEXITCODE

    if ($depsDownloadExitCode -ne 0 -or $buildDepsDownloadExitCode -ne 0) {
        Write-Warning "[MomAI] Some wheels failed to download. Runtime will fallback to internet."
        if (Test-Path $wheelsReadyMarker) {
            Remove-Item $wheelsReadyMarker -Force -ErrorAction SilentlyContinue
        }
    } else {
        # Build FortScript wheel from monorepo and add to wheels cache
        $fortscriptDir = Join-Path (Join-Path $PSScriptRoot "..") "..\fortscript"
        if (Test-Path $fortscriptDir) {
            Write-Host "[MomAI] Building FortScript wheel..." -ForegroundColor Cyan
            & $pythonExe -m pip wheel --no-deps --wheel-dir "$wheelsDir" "$fortscriptDir" 2>&1 | ForEach-Object { Write-Host "  $_" }
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "[MomAI] Failed to build FortScript wheel."
            } else {
                Write-Host "[MomAI] FortScript wheel added to cache." -ForegroundColor Green
            }
        }

        $wheelCount = (Get-ChildItem $wheelsDir -Filter "*.whl" -ErrorAction SilentlyContinue).Count
        $totalSize = [math]::Round(
            (Get-ChildItem $wheelsDir -Recurse -File -ErrorAction SilentlyContinue |
             Measure-Object -Property Length -Sum).Sum / 1MB, 1
        )
        New-Item -ItemType File -Path $wheelsReadyMarker -Force | Out-Null
        Write-Host "[MomAI] Downloaded $wheelCount wheels ($totalSize MB)" -ForegroundColor Green
        Write-Host "[MomAI] Offline wheel cache marked as ready." -ForegroundColor Green
    }
}

Write-Host "[MomAI] Full hydration complete! All binaries and wheels are ready." -ForegroundColor Green
