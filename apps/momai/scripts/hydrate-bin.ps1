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

function Assert-Sha256 {
    param([string]$Path, [string]$Expected)
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) {
        throw "SHA-256 mismatch for $Path. Expected $Expected, got $actual"
    }
}

$uvVersion = "0.11.29"
$uvSha256 = "a047d55651bc3e0ca24595b25ec4cfcb10f9dca9fb56514e661269b37d4fae68"
$pythonSha256 = "86ee8267900240c96369adb2cbc1af8f543f860d2e22be5adb7362f3cbe61059"
$vcRedistSha256 = "cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b"
$defaultLlamaVersion = "b10094"
$defaultLlamaCpuSha256 = "4a7982257a1b567f90ccd191802b31e50d9aa9b10dc0190c3e0cadede3bef699"
$defaultLlamaVulkanSha256 = "177ac2c14182f8082dd3a51edec8383186d851aac868cdac83e7d21e93f2ce3c"

# 1. Download UV (skip if already present)
$uvExe = Join-Path $binDir "uv.exe"
if (Test-Path $uvExe) {
    Write-Host "[MomAI] UV already present, skipping download." -ForegroundColor Green
} else {
    Write-Host "[MomAI] Downloading UV..." -ForegroundColor Cyan
    $uvUrl = "https://github.com/astral-sh/uv/releases/download/$uvVersion/uv-x86_64-pc-windows-msvc.zip"
    $uvZip = Join-Path $binDir "uv.zip"
    try {
        Get-ChildItem $binDir -Filter "uv*.exe" | Remove-Item -Force -ErrorAction SilentlyContinue

        curl.exe -L $uvUrl -o "$uvZip"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed with exit code $LASTEXITCODE" }
        Assert-Sha256 -Path $uvZip -Expected $uvSha256

        Expand-Archive -Path $uvZip -DestinationPath $binDir -Force
        Remove-Item $uvZip -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "[MomAI] Failed to download or extract UV: $($_.Exception.Message)"
    }
}

# 2. Download Portable Python (skip if already present)
$targetPython = Join-Path (Join-Path $binDir "python") "win32"
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
        Assert-Sha256 -Path $pyTar -Expected $pythonSha256
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

    # Move the actual python folder to bin/python/win32
    $extractedPath = Join-Path $pyExtractDir "python"

    if (Test-Path $extractedPath) {
        $parentDir = Split-Path $targetPython -Parent
        if (-not (Test-Path $parentDir)) { New-Item -ItemType Directory -Path $parentDir | Out-Null }

        if (Test-Path $targetPython) { Remove-WithRetry $targetPython }
        Move-Item -Path $extractedPath -Destination $targetPython -Force
        Write-Host "[MomAI] Python ready in $targetPython" -ForegroundColor Green
    } else {
        Write-Error "[MomAI] Extraction failed: $extractedPath not found."
        Get-ChildItem "$pyExtractDir"
    }

    Remove-Item -Recurse -Force $pyExtractDir -ErrorAction SilentlyContinue
}

# Fix for Windows Build Errors: Delete the redundant 'terminfo' database which causes EACCES/permission errors.
# We check both the parent and target directories to handle different extraction layouts.
$terminfoPaths = @(
    Join-Path $targetPython "share/terminfo"
    Join-Path (Join-Path $binDir "python") "share/terminfo"
)
foreach ($path in $terminfoPaths) {
    if (Test-Path $path) {
        Write-Host "[MomAI] Cleaning up terminfo database at $path to prevent build errors..." -ForegroundColor Cyan
        Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
    }
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
        Assert-Sha256 -Path $vcExe -Expected $vcRedistSha256
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
            if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir | Out-Null }
            # Clean only Windows-native artifacts to preserve Linux files in shared folders.
            Get-ChildItem -Path $TargetDir -Recurse -File -Include "*.exe", "*.dll", "*.pdb", "*.lib" -ErrorAction SilentlyContinue |
                Remove-Item -Force -ErrorAction SilentlyContinue
            Copy-Item -Path (Join-Path $sourceDir "*") -Destination $TargetDir -Recurse -Force
        } finally {
            if (Test-Path $tmpExtract) { Remove-WithRetry $tmpExtract | Out-Null }
        }
    }

    $llamaVersion = if ([string]::IsNullOrWhiteSpace($env:MOMAI_LLAMA_VERSION)) { $defaultLlamaVersion } else { $env:MOMAI_LLAMA_VERSION }
    $llamaCpuSha256 = if ($llamaVersion -eq $defaultLlamaVersion) { $defaultLlamaCpuSha256 } else { $env:MOMAI_LLAMA_CPU_SHA256 }
    $llamaVulkanSha256 = if ($llamaVersion -eq $defaultLlamaVersion) { $defaultLlamaVulkanSha256 } else { $env:MOMAI_LLAMA_VULKAN_SHA256 }

    if ([string]::IsNullOrWhiteSpace($llamaCpuSha256) -or [string]::IsNullOrWhiteSpace($llamaVulkanSha256)) {
        throw "[MomAI] llama.cpp overrides require MOMAI_LLAMA_CPU_SHA256 and MOMAI_LLAMA_VULKAN_SHA256."
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
        Assert-Sha256 -Path $cpuZip -Expected $llamaCpuSha256
        Expand-LlamaZip -ZipPath $cpuZip -TargetDir $cpuDir

        Write-Host "[MomAI] Downloading llama Vulkan build: $vulkanAsset" -ForegroundColor Cyan
        curl.exe -fL "$llamaBaseUrl/$vulkanAsset" -o "$vulkanZip"
        if ($LASTEXITCODE -ne 0) { throw "Curl failed downloading $vulkanAsset (exit $LASTEXITCODE)" }
        Assert-Sha256 -Path $vulkanZip -Expected $llamaVulkanSha256
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
$wheelsDir = Join-Path (Join-Path $binDir "wheels") "win32"
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
