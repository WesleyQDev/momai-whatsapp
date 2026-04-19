param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Convert-WindowsPathToWsl {
    param([string]$WindowsPath)

    if ([string]::IsNullOrWhiteSpace($WindowsPath)) {
        throw "[MomAI] Caminho Windows inválido para conversão WSL."
    }

    $normalized = $WindowsPath -replace '/', '\'
    if ($normalized -notmatch '^[A-Za-z]:\\') {
        throw "[MomAI] Caminho fora do padrão esperado (ex: C:\...): $WindowsPath"
    }

    $drive = $normalized.Substring(0, 1).ToLowerInvariant()
    $rest = $normalized.Substring(2).TrimStart('\') -replace '\\', '/'
    return "/mnt/$drive/$rest"
}

if (-not (Test-CommandExists "wsl.exe")) {
    throw "[MomAI] WSL não está disponível. Instale/ative o WSL para usar build Linux."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$skipInstallFlag = if ($SkipInstall) { "1" } else { "0" }
$repoLinux = Convert-WindowsPathToWsl $repoRoot
$appLinux = Convert-WindowsPathToWsl $appRoot

$bashScript = @"
#!/usr/bin/env bash
set -euo pipefail

SRC_REPO="$repoLinux"
SRC_APP="$appLinux"
BUILD_ROOT="`$HOME/.momai-linux-build"
DST_REPO="`$BUILD_ROOT/repo"
DST_APP="`$DST_REPO/apps/momai"

echo "[MomAI] Repo origem (montado): `$SRC_REPO"
echo "[MomAI] App origem  (montado): `$SRC_APP"
echo "[MomAI] Repo build  (Linux):   `$DST_REPO"

if ! command -v node >/dev/null 2>&1; then
  echo "[MomAI] Node.js não encontrado no WSL. Instale Node 20+ no Linux/WSL."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    echo "[MomAI] pnpm não encontrado no WSL. Ativando via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    echo "[MomAI] pnpm/corepack não encontrado no WSL. Instale pnpm no Linux/WSL."
    exit 1
  fi
fi

mkdir -p "`$BUILD_ROOT"
mkdir -p "`$DST_REPO"

echo "[MomAI] Sincronizando código para workspace Linux isolado..."
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.git' \
    --exclude '.venv' \
    --exclude 'node_modules' \
    --exclude 'apps/*/node_modules' \
    --exclude '**/__pycache__' \
    --exclude '*.pyc' \
    --exclude 'apps/momai/bin' \
    --exclude 'apps/momai/dist' \
    --exclude '.turbo' \
    "`$SRC_REPO/" "`$DST_REPO/"
else
  echo "[MomAI] rsync não encontrado, usando tar como fallback..."
  rm -rf "`$DST_REPO"
  mkdir -p "`$DST_REPO"
  tar -C "`$SRC_REPO" \
    --exclude='.git' \
    --exclude='.venv' \
    --exclude='node_modules' \
    --exclude='apps/*/node_modules' \
    --exclude='*/__pycache__' \
    --exclude='*.pyc' \
    --exclude='apps/momai/bin' \
    --exclude='apps/momai/dist' \
    --exclude='.turbo' \
    -cf - . | tar -C "`$DST_REPO" -xf -
fi

echo "[MomAI] Normalizando fim de linha (LF) para scripts shell..."
find "`$DST_REPO/apps" -type f -name "*.sh" -print0 | while IFS= read -r -d '' f; do
  sed -i 's/\r$//' "`$f"
  chmod +x "`$f" || true
done

if [ "$skipInstallFlag" != "1" ]; then
  echo "[MomAI] Instalando dependências no WSL (pnpm install --frozen-lockfile)..."
  cd "`$DST_REPO"
  pnpm install --frozen-lockfile
else
  echo "[MomAI] Pulando instalação de dependências (--SkipInstall)."
fi

cd "`$DST_APP"
echo "[MomAI] Rodando build Linux via WSL..."
pnpm build:linux

echo "[MomAI] Sincronizando artefatos (dist) de volta para o projeto no Windows..."
mkdir -p "`$SRC_APP/dist"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude 'linux-unpacked/' \
    --exclude 'win-unpacked/' \
    --exclude 'mac/' \
    --exclude 'builder-effective-config.yaml' \
    "`$DST_APP/dist/" "`$SRC_APP/dist/"
else
  rm -rf "`$SRC_APP/dist"
  mkdir -p "`$SRC_APP/dist"
  tar -C "`$DST_APP/dist" \
    --exclude='linux-unpacked' \
    --exclude='win-unpacked' \
    --exclude='mac' \
    --exclude='builder-effective-config.yaml' \
    -cf - . | tar -C "`$SRC_APP/dist" -xf -
fi

echo "[MomAI] Build Linux finalizado com sucesso."
"@

Write-Host "[MomAI] Iniciando build Linux via WSL..." -ForegroundColor Cyan
${tmpName} = "momai-build-linux-" + [Guid]::NewGuid().ToString("N") + ".sh"
$tmpScriptWindows = Join-Path $env:TEMP $tmpName
$tmpScriptLinux = Convert-WindowsPathToWsl $tmpScriptWindows

try {
    $bashScriptLf = $bashScript -replace "`r`n", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tmpScriptWindows, $bashScriptLf, $utf8NoBom)
    & wsl.exe bash -n $tmpScriptLinux
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[MomAI] Erro de sintaxe no script temporario. Conteudo:" -ForegroundColor Red
        & wsl.exe bash -lc "nl -ba '$tmpScriptLinux' | sed -n '1,120p'"
        throw "[MomAI] Script bash temporario invalido (codigo $LASTEXITCODE)."
    }
    & wsl.exe bash $tmpScriptLinux
    if ($LASTEXITCODE -ne 0) {
        throw "[MomAI] Build Linux via WSL falhou com codigo $LASTEXITCODE."
    }
} finally {
    Remove-Item -LiteralPath $tmpScriptWindows -Force -ErrorAction SilentlyContinue
}
