---
description: Prepara e executa build/release em plataformas específicas
---

O MomAI pode ser buildado para Windows (.exe NSIS), Windows (.appx Store/Test) e Linux (.AppImage/.deb). O release pode rodar localmente ou via GitHub Actions.

## 1. Escolher plataformas

Pergunte ao usuário quais builds quer:

| Plataforma | Comando | Saída |
|------------|---------|-------|
| Windows .exe (NSIS) | `pnpm build:exe` | `MomAI-Installer.exe` + `latest.yml` |
| Windows .appx Store | `pnpm build:appx:store` | `MomAI.appx` |
| Windows .appx Test | `pnpm build:appx:test` | `MomAI-Teste.appx` (assinado) |
| Linux | `pnpm build:linux` | `.AppImage` + `.deb` + `latest-linux.yml` |

Para múltiplas plataformas, use `pnpm build:all` ou o script `scripts/build-all.ps1`.

## 2. Escolher modo de release

### Local (via script PowerShell)

O script `scripts/release.ps1` faz tudo:
- Build Windows nativamente
- Build Linux via Docker (precisa de **Docker Desktop** rodando)
- Cria/atualiza release em `WesleyQDev/MomAI-App`

```powershell
# Verificar se Docker está rodando (necessário para Linux)
docker info 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker Desktop não está rodando."
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  Write-Host "Aguardando Docker iniciar... (até 120s)"
  $timeout = 120
  do {
    Start-Sleep -Seconds 5
    docker info 2>$null | Out-Null
    $timeout -= 5
  } while ($LASTEXITCODE -ne 0 -and $timeout -gt 0)
}

# Executar release
scripts/release.ps1 -Version "X.Y.Z"
```

Se for build local **sem release** (só testar), use `scripts/build-all.ps1 -SkipUpload`.

### GitHub Actions

O workflow `.github/workflows/release.yml` faz o build no CI (sem precisar de Docker local). É acionado manualmente:

```
https://github.com/WesleyQDev/momai/actions/workflows/release.yml
```

Requer input `tag` (ex: `v1.6.0`). O CI:
1. **build-win**: Windows .exe no `windows-latest`
2. **build-linux**: Linux .AppImage/.deb no `ubuntu-latest`
3. **release**: Publica em `WesleyQDev/MomAI-App`

## 3. Executar

Baseado nas escolhas do usuário, execute o comando apropriado.

```bash
# Full release local (todas plataformas + upload)
pwsh -NoProfile -File scripts/release.ps1 -Version "X.Y.Z"

# Apenas Windows .exe local
pnpm build:exe

# Apenas Linux local (precisa Docker)
pnpm build:linux

# Build tudo local sem upload
pwsh -NoProfile -File scripts/build-all.ps1 -SkipUpload

# Build local com plataformas específicas
pwsh -NoProfile -File scripts/build-all.ps1 -Version "X.Y.Z" -SkipWindows # ou -SkipLinux
```
