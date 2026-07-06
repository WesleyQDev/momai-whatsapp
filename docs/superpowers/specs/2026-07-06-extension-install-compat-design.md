# Extension Install & Compatibility — Design

**Data:** 2026-07-06
**Status:** Draft (aguardando revisão do usuário)
**Autores:** WesleyQDev (brainstorm com agente)

## Contexto e Problema

Hoje o fluxo de instalar extensões no MomAI tem três problemas fundo:

1. **Download URL hardcoded** — o `community-extensions.json` aponta para `download_url`/`version` fixos. Se a versão publicada no GitHub não tiver o asset ZIP correspondente, o app devolve **HTTP 404 silencioso** e a UI mostra um erro genérico. Já aconteceu com `whatsapp v0.3.31` (release criada, asset não anexado) e foi a deixa para esta refatoração.

2. **Sem checagem de compatibilidade** — embora exista `momai_compat` no `manifest.json` das extensões e utilitários `semver-compat.js` (`satisfiesRange`, `findBestCompatibleRelease`, `categorizeReleases`) e o endpoint `GET /extensions/<id>/releases` já devolva `recommended_version`, o botão "Instalar" da Loja não usa nada disso. Assina cegamente o `download_url` do registry.

3. **Feedback de install pobre** — o status NDJSON do `POST /extensions/install` só manda `{ status, percent, speed }` e reflete-se só ao estágio de download. Após o download, passam pelas etapas `verifyChecksum → extractZip → flattenExtractedDir → installExtensionDependencies → loadExtensions → startPersistent → syncSkillAndToolIndexes → executeHook` sem reportar nada. Para extensões pesadas (ex: WhatsApp com dependências copiadas), o usuário vê um spinner parado em "100% Baixando..." por vários segundos, sem saber que o app ainda está processando.

4. **Mensagens Electron nativas** — erros de instalação usam `alert()` (ExtensionsView.tsx:1159) e desinstalação usa `window.confirm()` (linha 1180). Quebra o padrão visual do restante da app.

## Objetivos

- Eliminar o bug do 404 silencioso em install.
- Fazer o install respeitar `momai_compat` declarado.
- Reportar progresso em múltiplos estágios com ETA, bytes e speed.
- Substituir `alert/confirm` por componentes próprios.
- Tudo isso sem quebrar extensões já instaladas (backward-compat).

## Não-Objetivos (Fora de Escopo)

- Otimização de `installExtensionDependencies` (symlink de `node_modules` em unix).
- Refatorar `installExtensionDependencies` em si.
- Suporte a múltiplas arquiteturas de extensão.
- Suporte a extension signing / verificação GPG.
- Permitir downgrade automático de versão instalada quando uma mais nova incompatível surge (apenas sugere manualmente).

## Decisões de Política (confirmadas pelo usuário)

1. **Compatibilidade é declarada por release** — fallback pro manifest do branch main. Cada release do GitHub traz `momai_compat` no body (front-matter YAML ou bloco `>[!NOTE]`). Se não achar, fallback pro `manifest.json` do `main` branch do repo da extensão. Default = `null` (compatível com tudo).

2. **Botão "Instalar" da Loja usa `recommended_version` automaticamente** — não há modal de seleção. UI fica limpa para usuário leigo. Histórico de versões (rota já existente) poderá adicionar botão por versão no futuro.

3. **Nenhuma versão compatível** — botão Instalar fica desativado. Card mostra mensagem: "Nenhuma versão compatível com MomAI X.Y.Z". Não força instalar versão incompatível.

4. **Extensão instalada torna-se incompatível após update do MomAI** — badge vermelho "Incompatível" no card Minhas Skills + botão "Atualizar" que dispara install da `recommended_version` compatível. Se nem essa existir, botão "Atualizar" fica desativado com tooltip.

5. **Ecossistema de terceiros (estilo Obsidian)** — extensões podem ser criadas por qualquer autor open-source. Por isso `momai_compat` precisa ser declarado por release (imutável no GitHub), não no `main` branch (pode ser abandonado).

## Arquitetura

### Componentes existentes (reaproveitados)

- `apps/momai/scripts/node-core/utils/semver-compat.js` — util pronto.
- `apps/momai/scripts/node-core/services/community-registry.js`:
  - `fetchRegistry()` — busca `community-extensions.json`.
  - `fetchReleases(repo)` — busca releases do GitHub, **filtra releases sem asset ZIP** (linha 177).
  - `fetchManifest(repo)` — busca `manifest.json` do `main` branch.
- `apps/momai/scripts/node-core/api/routes/extensions.routes.js`:
  - `POST /extensions/install` — fluxo NDJSON que vou estender.
  - `GET /extensions/<id>/releases` — já devolve `{ releases, installed_version, recommended_version, app_version }`.
- `apps/momai/scripts/node-core/services/skill-orchestrator.js:117` — propaga `momai_compat` do manifest instalado no payload de `/extensions`.

### Componentes novos ou modificados

1. **`community-registry.js :: parseReleaseCompat(release)`** (novo helper)
   - Regex leve para extrair `momai_compat` do `release.body`.
   - Suporta formato YAML front-matter no topo do body:
     ```yaml
     ---
     momai_compat: ">=1.4.0 <2.0.0"
     ---
     ```
     e formato `> [!NOTE] momai_compat: >=1.4.0 <2.0.0`.
   - Retorna `string | null`.

2. **`community-registry.js :: fetchReleases` (modificar)**
   - Para cada release, chamar `parseReleaseCompat(r)`. Se retornar `null`, busca fallback via `fetchManifest(repo)` (caching para não pedir o manifest toda release). Anexa `momai_compat` em cada item do array retornado.
   - Não mudar a assinatura do retorno público (array de releases), apenas enriquecer cada item com `momai_compat`.

3. **`extensions.routes.js :: validateInstallUrl` (extender)**
   - Hoje só valida que `download_url` está em `https://github.com/<repo>/releases/`. Acrescentar:
     - Fazer HEAD request do URL. Se não-200, retornar `release_asset_missing`.
     - Achar a release pelo `browser_download_url` no array já fetched. Se não achar, retornar `unknown_release`.

4. **`extensions.routes.js :: POST /extensions/install` (modificar)**
   - Aceitar três formas de payload:
     ```jsonc
     { "id": "whatsapp" }                        // default — escolhe recommended_version
     { "id": "whatsapp", "version": "0.3.30" }   // histórico de versões
     { "id": "whatsapp", "download_url": "..." } // backward-compat (vai ser validado)
     ```
   - Resumo do fluxo:
     1. Pega `repo` do `community-extensions.json` (ou fallback pra `dev-extensions.json` em dev).
     2. `fetchReleases(repo)` (já com `momai_compat` populado pela modificação acima).
     3. Determina `appVersion` via `context.appVersion` (já injetado no contexto).
      4. Seleciona a release:
         - Se `version` explícita, busca por tag e valida momai_compat.
         - Se `download_url` explícito (back-compat): o `validateInstallUrl` já confere domínio `https://github.com/<repo>/releases/...`; depois busca por `browser_download_url` no array já fetched e valida momai_compat da release correspondente.
         - Default: `findBestCompatibleRelease(releases, appVersion)` → recommended_version (já filtrada por releases com asset `.zip` válido).
      5. Se não achou release: `409 { ok: false, error: "no_installable_release" }`.
      6. Se a release escolhida tem `momai_compat` e `!satisfiesRange(appVersion, momai_compat)`: `409 { ok: false, error: "incompatible_version", app_version, required_range, release_version }`.
      7. Se o chosen `download_url` falha no HEAD (não-200, ex. asset foi removido depois): `409 { ok: false, error: "release_asset_missing", release_version, suggested_action: "open_releases" }`. Nota: quando `recommended_version` é escolhida dinamicamente, releases sem asset já foram filtradas por `fetchReleases` (linha 177), então esse caso só dispara quando o payload traz `download_url` explícito.
     8. Baixa o ZIP (já tem `downloadFile`).
     9. Continua o fluxo atual (verifyChecksum → extractZip → flattenExtractedDir → installExtensionDependencies → loadExtensions → startPersistent → syncSkillAndToolIndexes → executeHook).

5. **`extensions.routes.js :: sendInstallStage` (novo helper)** — substitui `sendStatus` por wrapper que monta shape multi-stage:
   ```jsonc
   {
     "stage": "downloading",         // downloading | verifying | extracting | linking_deps | indexing | starting_worker | done
     "status": "Baixando...",        // i18n key no frontend
     "percent": 47,                  // 0-100 dentro daquele estágio
     "global_percent": 12,           // 0-100 global (estimado por stage)
     "bytes_total": 188547,            // só em downloading/linking_deps
     "bytes_done": 89340,
     "speed_bps": 23456,             // só em downloading
     "eta_seconds": 4                // só em downloading/linking_deps
   }
   ```

6. **`skill-orchestrator.js :: buildExtensionsPayload` (extender)**
   - Para cada extensão instalada, calcular `compat_status`:
     - `"compatible"` se `satisfiesRange(appVersion, manifest.momai_compat) === true`.
     - `"incompatible"` se `=== false`.
     - `"unknown"` se `installed.momai_compat` ausente ou inválida.
   - Não adiciona fetch de releases aqui (caro para `n` extensões). A infra pra popular `recommended_version` no payload de extensão instalada (badge "Atualizar") vem sob demanda via `GET /extensions/<id>/releases` (já implementado).

7. **`api.ts :: installExtension` (modificar assinatura)**
   ```ts
   export async function installExtension(
     id: string,
     opts?: {
       version?: string
       downloadUrl?: string  // deprecated, mantido para back-compat
       onProgress?: (p: InstallProgress) => void
     }
   ): Promise<void>
   ```
   - `InstallProgress` shape:
     ```ts
     export type InstallStage =
       | 'downloading' | 'verifying' | 'extracting' | 'linking_deps'
       | 'indexing' | 'starting_worker' | 'done'
     
     export interface InstallProgress {
       stage: InstallStage
       status: string
       percent: number
       global_percent: number
       bytes_total?: number
       bytes_done?: number
       speed_bps?: number
       eta_seconds?: number
     }
     ```

8. **`ExtensionsView.tsx :: installProgress` (modificar state)**
   - Trocar state de `{ percent, speed, status }` para o `InstallProgress` completo.
   - Renderizar card inline com:
     ```
     ┌─────────────────────────────────────┐
     │ Instalando WhatsApp                 │
     │ ▓▓▓▓▓░░░░░░░░░░  35%                │
     │ Etapa: Copiando dependências…       │
     │ 23 MB de 65 MB · 12 MB/s · ~3s      │
     └─────────────────────────────────────┘
     ```
   - Quando `eta_seconds > 30`, troca a animação determinada por spinner indeterminado + texto "Isso pode levar alguns instantes" (evita countdown falso).
   - **Card de erro inline** substitui `alert()` (linha 1159).
   - **Modal de desinstalação** (`ExtensionUninstallModal`) substitui `window.confirm()` (linha 1180).

9. **Badge de compatibilidade em "Minhas Skills"**
   - No card de cada extensão instalada:
     - `compat_status === "compatible"` → sem badge.
     - `compat_status === "incompatible"` → badge vermelho "Incompatível com MomAI X.Y.Z".
     - `compat_status === "unknown"` → sem badge (tratado como compatível).
   - Botão "Atualizar" dentro do badge. Ao clicar, dispara `installExtension(id)` (que vai escolher `recommended_version`).
   - Botão "Atualizar" desativado com tooltip "Nenhuma versão compatível disponível" se `recommended_version === null` (consultado sob demanda em `/extensions/<id>/releases` ao abrir o card, com cache em memória).

10. **Botão "Instalar" da Loja desativado quando `recommended_version === null`**
    - Estado OPEN do card: ao renderizar o card da extensão na Loja, frontend consulta `GET /extensions/<id>/releases` (já existe, retorna `recommended_version`).
    - Cache local (em memória, por sessão): `recommendedVersionByExtId: Map<string, string | null>`.
    - Não re-fetch a cada render — invalidar cache quando `loadData()` roda (novo install/uninstall).

11. **i18n** — novas strings em `apps/momai/src/renderer/src/locales/pt-BR.json` e `en-US.json`:
    ```
    extensions.stages.downloading
    extensions.stages.verifying
    extensions.stages.extracting
    extensions.stages.linking_deps
    extensions.stages.indexing
    extensions.stages.starting_worker
    extensions.stages.done
    extensions.install.incompatible
    extensions.install.no_compatible
    extensions.install.eta_seconds
    extensions.install.eta_large
    extensions.install.confirmUninstall.title
    extensions.install.confirmUninstall.body
    extensions.install.confirmUninstall.confirm
    extensions.install.confirmUninstall.cancel
    extensions.install.error.title
    ```

## Fluxo de dados

### Cenário 1: Usuário clica "Instalar" na Loja (sucesso)

```text
[UI] button onClick → installExtension(id)
   → POST /extensions/install { id }
[Backend]
   1. fetchRegistry() → community-extensions.json → item.repo
   2. fetchReleases(repo) → [{ version, download_url, momai_compat, ... }]
   3. findBestCompatibleRelease(releases, appVersion) → release escolhida
   4. HEAD no download_url → 200 OK
   5. downloadFile(zipPath, onProgress: sendInstallStage("downloading", ...))
   6. verifyChecksum → sendInstallStage("verifying")
   7. clean extDir → extractZip → sendInstallStage("extracting")
   8. flattenExtractedDir
   9. installExtensionDependencies → sendInstallStage("linking_deps", ...)
   10. skillRegistry.loadExtensions()
   11. syncSkillAndToolIndexes(true) → sendInstallStage("indexing")
   12. extensionHostManager.startPersistent → sendInstallStage("starting_worker")
   13. executeHook(id, 'onInstall')
   14. sendInstallStage("done") → res.end()
[UI] Card "Concluído" → some e re-renderiza a loja
```

### Cenário 2: Versão recomendada incompatível

```text
[Backend]
   fetchReleases(repo) → [{ v0.4.0, momai_compat: ">=2.0.0" }]
   findBestCompatibleRelease(releases, "1.5.2") → null
   409 { ok: false, error: "no_installable_release", app_version: "1.5.2" }
[UI] Card inline: "Nenhuma versão compatível com MomAI 1.5.2"
     Botão "Instalar" desativado
```

### Cenário 3: Extensão instalada vira incompatível apos update do MomAI

```text
GET /extensions:
   - skill-orchestrator calcula para cada installed:
     compat_status = satisfiesRange(appVersion, installed.momai_compat) ? "compatible" : "incompatible"
   - retorno tem item.compat_status = "incompatible"
[UI] "Minhas Skills" → badge vermelho "Incompatível com MomAI 1.6.0"
     Botão "Atualizar" (sempre visível)
   → onClick: GET /extensions/<id>/releases
     - Se recommended_version !== null: habilita o botão → installExtension(id)
     - Se recommended_version === null: tooltip "Nenhuma versão compatível"
```

### Cenário 4: Bug original (download_url 404)

```text
[Backend]
   fetchReleases(repo) → um dos releases tem asset.size === 0 ou zip asset missing
   - Na nova lógica: releases sem asset já são filtrados por fetchReleases (linha 177). 
   - recommended_version só aponta pra releases com asset válido.
   - Se hardcoded download_url do registry referenciar v0.3.31 e v0.3.31 não tem asset, 
     findBestCompatibleRelease pula essa release e escolhe v0.3.30.
[UI] Install segue normal.
```

## Tratamento de erros

| Erro | HTTP | Condição | Mensagem pro usuário |
|------|------|----------|---------------------|
| `unknown_extension` | 404 | `id` não existe em `community-extensions.json` nem `dev-extensions.json` | "Extensão não encontrada" |
| `no_installable_release` | 409 | `fetchReleases` retornou vazio OU nenhuma release tem asset ZIP | "Nenhuma versão instalável disponível para esta extensão" |
| `incompatible_version` | 409 | Release escolhida tem `momai_compat` que não satisfaz `appVersion` | "Versão {{version}} requer MomAI {{range}}" |
| `release_not_found_by_version` | 409 | `version` explícita não existe no GitHub | "Versão {{version}} não existe" |
| `release_asset_missing` | 409 | Release existe mas HEAD do `download_url` retorna não-200 | "Arquivo ZIP indisponível no GitHub. Verifique a release em {{repo_url}}." |
| `checksum_mismatch` | 500 | `verifyChecksum` falhou | "Arquivo corrompido (falha na verificação de integridade). Tente novamente." |
| `extract_failed` | 500 | `extractZip` falhou | "Não foi possível extrair o arquivo ZIP." |
| `dep_install_failed` | — | `installExtensionDependencies` falhou | Não bloqueante. Log + warning no console do user. Continua install. |
| `start_worker_failed` | — | `extensionHostManager.startPersistent` falhou | Não bloqueante. Log no console. Skill funciona, mas sem background worker. |
| `onInstall_hook_failed` | — | `executeHook` falhou | Não bloqueante. Log. Skill instalada. |

## Testes

### Backend (`scripts/node-core/tests/`)

- **`registry-compat.test.js`** (novo) — estende o `registry.test.js` atual:
  - `parseReleaseCompat` detecta os dois formatos (front-matter YAML e `[!NOTE]`).
  - `parseReleaseCompat` retorna `null` quando body não tem `momai_compat`.
  - `fetchReleases` popula `momai_compat` em cada item.

- **`extensions-install.test.js`** (extender o atual):
  - `POST /extensions/install { id }` escolhe a `recommended_version` quando nenhuma `version` é passada.
  - `POST /extensions/install { id, version }` instala versão específica.
  - `POST /extensions/install { id, download_url }` valida URL e grupo de releases.
  - 409 `incompatible_version` quando `momai_compat` não satisfaz `appVersion`.
  - 409 `no_installable_release` quando `fetchReleases` retorna vazio.
  - 409 `release_asset_missing` quando HEAD no `download_url` falha.

### Frontend (`src/renderer/src/views/ExtensionsView.test.tsx`)

- Snapshot do card inline de progress com `stage=downloading`, `bytes_done`, `eta_seconds`.
- Card de erro inline substitui `alert()`.
- Modal de desinstalação aparece quando clica no botão "Desinstalar".

## Migração e Backward-Compat

- `community-extensions.json` atual com `download_url`/`version` hardcoded **continua funcionando**:
  - Backend usa `item.repo`. Se o repo tem releases com asset válido, prioriza `recommended_version` dinâmica e ignora o `download_url` hardcoded.
  - Se o repo não tem releases ainda publicadas (raro — extensão recém-criada antes de primeira release), o backend cai no `item.download_url` hardcoded como último recurso e faz HEAD pra validar.
  - Se nem isso existe ou está quebrado, 409 `no_installable_release`.
- Extensões já instaladas sem `momai_compat` no manifest → `compat_status = "unknown"` (tratado como compatível, sem badge).

## Performance

- `fetchReleases` faz 1 request HTTP (já cached por 15 min).
- `fetchManifest` faz 1 request (já cached durante o ciclo de releases).
- `parseReleaseCompat` é regex puro, O(1) por release.
- Multi-stage NDJSON adiciona poucos bytes por chunk, equivale ao custo atual.
- Nenhuma adição de CPU-bound.

## Logging

Cada stage logado em `[ExtensionsAPI]` (já padrão atual). Erros não-bloqueantes (`dep_install_failed`, `start_worker_failed`) seguem com `console.warn` (já feito). Erros bloqueantes seguem com `console.error` + retorno `409`/`500`.

## Pontos de extensão futuros

- **Botão por versão no histórico**: o `GET /extensions/<id>/releases` já entrega tudo. Frontend só precisa desenhar `releases[].installable = true` + botão que chama `installExtension(id, { version })`. Fica fora deste PR.
- **Pré-validação de download_url hardcoded**: hoje `fetchReleases` filtra releases sem asset ZIP. Futuramente pode-se pré-filtrar também no `community-extensions.json` para apontar sempre pra uma release válida — não precisa, porque já há fallback dinâmico.
- **Suporte a checksum SHA256** já existe; pode-se tornar obrigatório no futuro (`expected_sha256` em `community-extensions.json`).

## Critérios de aceite

1. Clicar "Instalar" em extensão publicada com release compatível **instala com sucesso** sem 404 silencioso. ✓
2. Clicar "Instalar" em extensão sem release compatível com a versão atual do MomAI **desativa o botão** com mensagem clara. ✓
3. Extensão instalada que fica incompatível após upgrade do MomAI mostra **badge vermelho** e botão "Atualizar" (ou desativado se nenhuma versão for compatível). ✓
4. Card de progress show **eta_seconds + bytes_done + speed_bps + stage atual**. ✓
5. Após download terminar, **próximos estágios** (extracting, linking_deps, indexing, starting_worker) são reportados individualmente, sem spinner travado em "100% Baixando...". ✓
6. `alert()` e `window.confirm()` em `ExtensionsView.tsx` são **removidos**, substituídos por card inline e modal próprio. ✓
7. Testes backend e frontend passam.
8. Pequenas extensões sem `momai_compat` continuam instaláveis (backward-compat).

## Apêndice: regex de `momai_compat`

```js
// YAML front-matter no topo do body (preferido)
const FRONTMATTER_RE = /^\s*-{3,}\s*\n[^]*?momai_compat\s*:\s*["']?([^"'\n]+)["']?/m

// Bloco NOTE (fallback)
const NOTE_RE = /momai_compat\s*:\s*["']?([^"'\n]+)["']?/

function parseReleaseCompat(release) {
  if (!release?.body) return null
  const fm = release.body.match(FRONTMATTER_RE)
  if (fm) return fm[1].trim()
  const note = release.body.match(NOTE_RE)
  if (note) return note[1].trim()
  return null
}
```
