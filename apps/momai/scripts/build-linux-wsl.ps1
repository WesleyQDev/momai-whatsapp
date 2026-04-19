param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandExists "wsl.exe")) {
    throw "[MomAI] WSL não está disponível. Instale/ative o WSL para usar build Linux."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Escape for single-quoted bash strings
$repoRootForBash = $repoRoot.Replace("\", "\\")
$appRootForBash = $appRoot.Replace("\", "\\")
$skipInstallFlag = if ($SkipInstall) { "1" } else { "0" }

$bashScript = @"
set -euo pipefail

REPO_WIN='$repoRootForBash'
APP_WIN='$appRootForBash'
SKIP_INSTALL='$skipInstallFlag'

REPO_LINUX=\$(wslpath -a "\$REPO_WIN")
APP_LINUX=\$(wslpath -a "\$APP_WIN")

echo "[MomAI] Repo (WSL): \$REPO_LINUX"
echo "[MomAI] App  (WSL): \$APP_LINUX"

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

cd "\$REPO_LINUX"

if [ "\$SKIP_INSTALL" != "1" ]; then
  echo "[MomAI] Instalando dependências no WSL (pnpm install --frozen-lockfile)..."
  pnpm install --frozen-lockfile
else
  echo "[MomAI] Pulando instalação de dependências (--SkipInstall)."
fi

cd "\$APP_LINUX"
echo "[MomAI] Rodando build Linux via WSL..."
pnpm build:linux
echo "[MomAI] Build Linux finalizado com sucesso."
"@

Write-Host "[MomAI] Iniciando build Linux via WSL..." -ForegroundColor Cyan
& wsl.exe bash -lc $bashScript
if ($LASTEXITCODE -ne 0) {
    throw "[MomAI] Build Linux via WSL falhou com código $LASTEXITCODE."
}

