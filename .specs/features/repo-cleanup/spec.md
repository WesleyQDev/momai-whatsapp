# Repo Cleanup Specification

## Problem Statement

O repositório contém ~270 MB de binários e build artifacts trackados diretamente
no Git (sem LFS), além de arquivos temporários, acidentais e artefatos de IDE que
não deveriam estar versionados. Isso aumenta desnecessariamente o tamanho do clone,
polui o histórico, e viola boas práticas de manutenção de repositório.

## Goals

- [x] Remover do tracking todos os binários, build artifacts e arquivos que não pertencem ao repositório
- [x] Atualizar `.gitignore` para prevenir que esses arquivos sejam readicionados
- [x] Preservar a capacidade de build/download dos binários necessários em tempo de build

## Out of Scope

| Item                        | Reason                                                  |
| --------------------------- | ------------------------------------------------------- |
| Migrar binários para LFS    | Escopo maior; requer reescrita de histórico             |
| Refatorar sistema de build  | Apenas adicionar `.gitignore` + remover do tracking     |
| Arquivos em `.agents/`      | Config de agente intencionalmente trackada              |
| Arquivos de documentação    | Fora do escopo de "limpeza de tracking"                 |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Binários llama/uv devem ser baixados em build-time | Serão adicionados ao `.gitignore`; build scripts existentes continuam funcionando | Já existem scripts de bootstrap que baixam python/uv | ✅ |
| `momai_certificado.pfx` | Deixar trackado; sinalizar no PR para mantenedor decidir | Pode ser certificado de code signing | ⚠️ Flag no PR |
| `.opencode/package-lock.json` | Remover do tracking | Lockfile de agente, não do projeto | ✅ |
| `test.txt`, `temp_comment.json`, `tmp_llama_help.txt` | Remover do tracking | Acidentais | ✅ |
| `test-chat-tts.cjs` | Deixar trackado; sinalizar no PR para mantenedor decidir | Pode ser útil para debug de TTS | ⚠️ Flag no PR |
| `excepts_list.json` | Manter | Análise de qualidade de código intencional | ✅ |
| `app-ads.txt` | Manter | Requisito Google Play para apps com anúncios | ✅ |
| `null` | Remover do tracking | Arquivo vazio, provavelmente acidental | ✅ |
| `assets/` na raiz (build artifacts) | Remover do tracking + adicionar ao `.gitignore` | Build output com hash, não é fonte | ✅ |
| Duplicatas de `icon.gif` | Deixar trackado; sinalizar no PR para mantenedor decidir | GIFs idênticos (mesmo md5) | ⚠️ Flag no PR |
| `Icone microsoft store.png` vs `ms-store-icon.png` | Deixar ambos; sinalizar no PR recomendando manter o de nome inglês | Duplicatas | ⚠️ Flag no PR |

---

## User Stories

### P1: Remover binários e build artifacts trackados ⭐ MVP

**User Story**: As a maintainer, I want to remove ~267 MB of binary blobs from git tracking
so that clones are faster and the repo doesn't balloon.

**Why P1**: ~270 MB of unnecessary data in every clone.

**Acceptance Criteria**:

1. WHEN checking tracked files THEN `apps/momai/bin/llama/cpu/*` SHALL NOT appear in `git ls-files`
2. WHEN checking tracked files THEN `apps/momai/bin/llama/vulkan/*` SHALL NOT appear in `git ls-files`
3. WHEN checking tracked files THEN `apps/momai/bin/uv`, `uv.exe`, `uvw.exe`, `uvx.exe` SHALL NOT appear in `git ls-files`
4. WHEN checking tracked files THEN `assets/` directory at root SHALL NOT appear in `git ls-files`
5. WHEN checking `.gitignore` THEN SHALL contain entries for `apps/momai/bin/llama/`, `apps/momai/bin/uv*`, and `/assets/`

**Independent Test**: `git ls-files apps/momai/bin/llama/ apps/momai/bin/uv* assets/` returns empty.

---

### P1: Remover arquivos que violam .gitignore ⭐ MVP

**User Story**: As a maintainer, I want files that match `.gitignore` patterns to actually
be ignored, not still tracked.

**Why P1**: `.gitignore` should reflect reality; tracked files that match .gitignore are bugs.

**Acceptance Criteria**:

1. WHEN running `git ls-files .vscode/settings.json` THEN SHALL return empty
2. WHEN running `git ls-files null` THEN SHALL return empty

---

### P2: Remover arquivos temporários/acidentais

**User Story**: As a maintainer, I want temp files and accidental check-ins removed.

**Why P2**: Polui a raiz do repositório com arquivos sem propósito.

**Acceptance Criteria**:

1. WHEN checking tracked files THEN `tmp_llama_help.txt` SHALL NOT appear
2. WHEN checking tracked files THEN `temp_comment.json` SHALL NOT appear
3. WHEN checking tracked files THEN `test.txt` SHALL NOT appear

---

### P2: Remover .opencode/package-lock.json do tracking

**User Story**: As a maintainer, I want the opencode agent lockfile removed from tracking.

**Why P2**: Lockfile de ferramenta de agente, não do projeto.

**Acceptance Criteria**:

1. WHEN checking tracked files THEN `.opencode/package-lock.json` SHALL NOT appear

---

### P3: Sinalizar ativos duplicados na raiz

**User Story**: As a maintainer, I want to be notified of duplicated assets at the repo root
so I can decide which to keep.

**Why P3**: Reduz poluição na raiz do repositório, mas requer decisão do mantenedor.

**Acceptance Criteria**:

1. WHEN opening the PR description THEN SHALL contain a note about `icon.gif` duplicates
   (root/ `saude/` `apps/momai/` `landing-page/`)
2. WHEN opening the PR description THEN SHALL contain a note about `Icone microsoft store.png`
   vs `ms-store-icon.png` recommending the English-named file be kept
3. WHEN opening the PR description THEN SHALL contain a note about `momai_certificado.pfx`
4. WHEN opening the PR description THEN SHALL contain a note about `test-chat-tts.cjs`

---

## Edge Cases

- WHEN a developer clones fresh after cleanup THEN `pnpm dev` SHALL still work
  (binaries must be downloadable at build-time or documented)
- WHEN a developer has local changes in these files THEN `git rm --cached` SHALL
  NOT delete their local copy

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| CLN-01 | P1: Llama binaries removal | Executed | ✅ Verified |
| CLN-02 | P1: UV binaries removal | Executed | ✅ Verified |
| CLN-03 | P1: .gitignore update for binaries + assets | Executed | ✅ Verified |
| CLN-04 | P1: .vscode/settings.json untrack | Executed | ✅ Verified |
| CLN-09 | P1: assets/ build artifacts removal | Executed | ✅ Verified |
| CLN-05 | P1: null file untrack | Executed | ✅ Verified |
| CLN-06 | P2: Temp files removal | Executed | ✅ Verified |
| CLN-07 | P2: .opencode/package-lock.json untrack | Executed | ✅ Verified |
| CLN-08 | P3: Duplicated icons cleanup | Executed | ✅ Flagged in PR |

**Coverage:** 9 total, 9 mapped to tasks, 0 unmapped ✅

---

## Success Criteria

- [x] `git ls-files apps/momai/bin/llama/ apps/momai/bin/uv* assets/` returns empty
- [x] `git ls-files .vscode/settings.json null tmp_llama_help.txt temp_comment.json test.txt .opencode/package-lock.json` returns empty
- [x] `.gitignore` has entries for `apps/momai/bin/llama/`, `apps/momai/bin/uv*`, `/assets/`
- [x] Fresh clone + build instructions work (no missing binaries) — confirmed via `hydrate-bin.sh`
