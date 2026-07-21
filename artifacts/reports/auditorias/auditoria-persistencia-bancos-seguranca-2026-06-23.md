# Auditoria de Persistência, Bancos de Dados e Segurança — MomAI

**Data:** 2026-06-23
**Escopo:** `apps/momai/` (Electron + Node Core) · `apps/core/` (Python sidecar) · Build/Installer NSIS
**Plataformas cobertas:** Windows (NSIS), Windows (MSIX/AppX), macOS, Linux
**Variantes analisadas:** `dev` · `nsis` · `appx-store` · `appx-test`

---

## Sumário Executivo

A MomAI tem um **perfil de privacidade geralmente bom** (zero telemetria externa, zero API keys persistidas, sem histórico de chat em SQLite), mas apresenta **3 problemas críticos** e **6 problemas médios** que devem ser corrigidos:

| # | Severidade | Problema |
|---|------------|----------|
| 1 | 🔴 **CRÍTICO** | **Credenciais WhatsApp (Baileys) em plain JSON no disco** — quem obtiver pode se passar pelo usuário |
| 2 | 🔴 **CRÍTICO** | **Cache do HuggingFace (Whisper) fora do userData** — sobrevive à desinstalação, vaza "fingerprint de uso" |
| 3 | 🔴 **CRÍTICO** | **`safeStorage` (keychain.ts) é placeholder** — wrapper pronto mas nunca usado |
| 4 | 🟡 **MÉDIO** | **Variants órfãs na desinstalação** — `MomAI-Dev/`, `MomAI-Store/`, `MomAI-Teste/` não são limpas |
| 5 | 🟡 **MÉDIO** | **Auto-start (login items) não é removido explicitamente** pelo NSIS custom |
| 6 | 🟡 **MÉDIO** | **Duplicação settings** — `node-core-store.json` (Node) + `momai.db` (Python SQLite) podem divergir |
| 7 | 🟡 **MÉDIO** | **`assistant_persona` e `user_name` em texto plano** — sem criptografia at-rest |
| 8 | 🟡 **MÉDIO** | **Sem TTL em histórico de chat** — cresce até 500 msgs/thread sem limpeza temporal |
| 9 | 🟡 **MÉDIO** | **`apps/core/.gitignore` não protege `.env`** — risco de commit de segredo |

---

## 1. Mecanismo Central de Paths

Toda a persistência do app roteia por `apps/momai/src/main/apply-variant-env.ts:17-19`:

```ts
app.setName(CURRENT_VARIANT.appName)
app.setAppUserModelId(CURRENT_VARIANT.appId)
app.setPath('userData', join(app.getPath('appData'), CURRENT_VARIANT.userDataSubdir))
```

### Paths resultantes (quando instalado)

| Plataforma | Caminho do userData |
|------------|---------------------|
| **Windows (NSIS)** | `%APPDATA%\MomAI\` |
| **Windows (MSIX store)** | `%LOCALAPPDATA%\Packages\<hash>\LocalCache\Roaming\MomAI-Store\` |
| **Windows (MSIX test)** | `%LOCALAPPDATA%\Packages\<hash>\LocalCache\Roaming\MomAI-Teste\` |
| **macOS** | `~/Library/Application Support/MomAI/` |
| **Linux** | `~/.config/MomAI/` |

**Variants** (`apps/momai/src/main/variants.ts:15-60`):

| Variant | userDataSubdir | Porta Node Core |
|---------|----------------|-----------------|
| `dev` | `MomAI-Dev` | 8050 |
| `nsis` | `MomAI` | 8100 |
| `appx-store` | `MomAI-Store` | 8200 |
| `appx-test` | `MomAI-Teste` | 8300 |

---

## 2. Mapa Completo de Persistência

### 2.1 Dados dentro de `<userData>/`

| # | Localização | Tipo | Tamanho típico | Sensibilidade | Limpo no uninstall NSIS? |
|---|-------------|------|----------------|---------------|---------------------------|
| 1 | `data/node-core-store.json` | Settings + lembretes + meta de extensions | KB-MB | **ALTA** (PII: nome) | ✅ SIM |
| 2 | `data/messages.json` | Histórico completo de chat | KB-50MB | **MUITO ALTA** | ✅ SIM |
| 3 | `data/notes/*.md` | Notas pessoais (markdown) | KB-MB | **ALTA** | ✅ SIM |
| 4 | `data/notes/.index.json` | Índice de notas | KB | Média | ✅ SIM |
| 5 | `data/extensions/<id>/` | Código de extensions instaladas | MB-centenas MB | Baixa | ✅ SIM |
| 6 | `data/extensions/<id>/<key>.json` | Storage por extension (1MB quota) | até 1MB/chave | Variável | ✅ SIM |
| 7 | `data/extensions/whatsapp/baileys-auth/` | **Credenciais Signal do WhatsApp** | KB-poucos MB | **🔴 CRÍTICA** | ✅ SIM |
| 8 | `data/extensions/whatsapp/*.json` | Contatos, chat history, whitelist, settings | MB | **ALTA** | ✅ SIM |
| 9 | `data/models/*.gguf` | Modelos LLM (Qwen, etc) | **2-8 GB** | Baixa | ✅ SIM |
| 10 | `data/semantic/lancedb/` | Vector DB (embeddings de notas/skills) | Dezenas MB-GB | **ALTA** | ✅ SIM |
| 11 | `data/observability-metrics.json` | Métricas de LLM (até 2000 traces) | KB-MB | Baixa | ✅ SIM |
| 12 | `logs/main.log` | Logs do main process (rotação 5MB) | MB | Média | ✅ SIM |
| 13 | `Local Storage/leveldb/` | localStorage do renderer (Chromium) | KB-poucos MB | **ALTA** (PII) | ✅ SIM |
| 14 | `economy-preferences.json` | Preferências modo gaming | KB | Baixa | ✅ SIM |
| 15 | `onboarding_completed.json` | Flag | KB | Baixa | ✅ SIM |
| 16 | `.sync.lock` | Lock de sync Python | KB | Baixa | ✅ SIM |
| 17 | `python_env/` | venv Python (kokoro, whisper, fastapi) | **centenas MB-2GB** | Baixa | ✅ SIM |
| 18 | `uv_cache/` | Cache de wheels Python | centenas MB | Baixa | ✅ SIM |
| 19 | `uv_python/` | Instalações Python (gerenciadas pelo uv) | centenas MB | Baixa | ✅ SIM |

### 2.2 Dados FORA de `<userData>/` (persistentes)

| # | Localização | Tipo | Tamanho | Limpo no uninstall? |
|---|-------------|------|---------|---------------------|
| 20 | `~/.cache/huggingface/hub/` (Windows: `%USERPROFILE%\.cache\huggingface\hub\`) | **Modelos Whisper** (faster-whisper) | **150MB-1.5GB por modelo** | ❌ **NÃO** (problema crítico #2) |
| 21 | `<install>/resources/core/services/voice/models/` | Kokoro ONNX (~300MB) | ~300MB | ✅ SIM (install dir removido) |
| 22 | `%LOCALAPPDATA%\MomAI-updater\` | Cache do auto-updater | dezenas MB | ✅ SIM (explícito) |
| 23 | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\momai*` | Auto-start no login | 1 chave | ⚠️ **Provavelmente sim** (electron-builder default), mas **NÃO garantido** pelo script custom |
| 24 | `HKLM\...\VC\Runtimes\x64` | **VC++ Redist** (instalado no sistema) | MB | ❌ NÃO (intencional, compartilhado) |
| 25 | `$APPDATA\MomAI-Dev\`, `MomAI-Store\`, `MomAI-Teste\` | **UserData de outras variants** | MB-GB | ❌ **NÃO** (problema #4) |

### 2.3 localStorage do renderer (dentro de `<userData>/Local Storage/`)

| Chave | Conteúdo | Sensibilidade |
|-------|----------|---------------|
| `momai_user_name` | Nome do usuário (PII) | **ALTA** |
| `momai_ai_tier` | Tier (lite/pro/ultra) | Baixa |
| `momai_theme` | Tema UI | Baixa |
| `momai_locale` | Idioma (pt-BR/en-US) | Baixa |
| `momai_autocomplete_history` | **Histórico de prompts** | **ALTA** |
| `momai_dev_mode` | Flag dev | Baixa |
| `momai_seen_panels` | Onboarding flags | Baixa |
| `momai_skip_intro` | UX flag | Baixa |
| `momai_default_note_created` | UX flag | Baixa |
| `momai_mode_changing` | UX flag | Baixa |
| `momai_show_context_ring` | Visual flag | Baixa |
| `momai_observability_enabled` | Feature flag | Baixa |
| `momai_logs_enabled` | Feature flag | Baixa |

---

## 3. Resposta à Pergunta 1: **O que fica permanentemente após desinstalação?**

### 3.1 Instalação NSIS (Windows)

O uninstaller em `apps/momai/build/installer.nsh:177-200` remove:

```nsh
RMDir /r "$APPDATA\MomAI"           ; userData NSIS (e tudo dentro, inclusive Local Storage/)
RMDir /r "$LOCALAPPDATA\MomAI"      ; Local data
RMDir /r "$LOCALAPPDATA\MomAI-updater"
```

**O que SOBREVIVE à desinstalação NSIS:**

| # | O que | Path | Por que sobrevive | Impacto de privacidade |
|---|-------|------|-------------------|------------------------|
| A | **Cache Whisper (HuggingFace)** | `%USERPROFILE%\.cache\huggingface\hub\` | Não é controlada pelo app; é cache global do `huggingface-hub` | Médio — fingerprint de uso (~150MB-1.5GB por modelo) |
| B | **Auto-start no login** | `HKCU\...\Run\momai*` | Script custom não cita cleanup; depende do electron-builder default | Baixo — apenas config de boot |
| C | **VC++ Redist** | `HKLM\...\VC\Runtimes\x64` | Intencional (compartilhado) | Nenhum — instalador de sistema |
| D | **Variants órfãs** | `%APPDATA%\MomAI-Dev\`, `MomAI-Store\`, `MomAI-Teste\` | Script só apaga `MomAI` | **ALTO** — userData inteiro de variants paralelas fica no disco |
| E | **Credenciais de dev anteriores** | `%APPDATA%\desktop\`, `%LOCALAPPDATA%\desktop\` | Script tenta limpar, mas é legacy (versões antigas) | Baixo — provavelmente já vazio |

### 3.2 Instalação MSIX/AppX (Windows Store)

A remoção é gerenciada pelo Windows AppStore. O Windows **remove automaticamente** `%LOCALAPPDATA%\Packages\<PackageFamilyName>\`, então:

- ✅ `MomAI-Store/` e `MomAI-Teste/` são removidos pelo Windows **dentro do seu PackageFamily**
- ⚠️ MAS o cache HF (Whisper) em `~/.cache/` **continua órfão**
- ⚠️ MAS dados de **outras variants** (NSIS vs Store instaladas lado-a-lado) ficam

### 3.3 macOS / Linux

- **macOS:** remoção padrão (app → Lixo apaga `~/Library/Application Support/MomAI/`)
- **Linux:** `apt remove` (deb) apaga `~/.config/MomAI/`; AppImage requer remoção manual
- **Ambos:** cache HF (`~/.cache/huggingface/`) **sobrevive** em ambos

### 3.4 Resumo visual

```
DESINSTALAÇÃO (NSIS) — O QUE SOBREVIVE:

  Disco C:\
  └── Users\<user>\
      ├── .cache\
      │   └── huggingface\hub\          ← 🔴 SOBREVIVE (Whisper, 150MB-1.5GB)
      └── AppData\
          ├── Roaming\
          │   ├── MomAI\                ← ✅ REMOVIDO (userData NSIS)
          │   ├── MomAI-Dev\            ← 🔴 SOBREVIVE (variants paralelas)
          │   ├── MomAI-Store\          ← 🔴 SOBREVIVE (variants paralelas)
          │   └── MomAI-Teste\          ← 🔴 SOBREVIVE (variants paralelas)
          └── LocalLow\                 ← ✅ REMOVIDO
              └── MomAI-updater\

  Registry\
  └── HKCU\Software\Microsoft\Windows\CurrentVersion\Run\momai*  ← ⚠️ Provavelmente sim (electron-builder default)

  Sistema (HKLM)\
  └── VC++ Redist                       ← ❌ NÃO (intencional, compartilhado)
```

---

## 4. Resposta à Pergunta 2: **Dados desnecessários / a reduzir no banco local**

### 4.1 SQLite em `apps/core/momai.db` (apenas settings)

A Core é **exemplar**: tabela única `settings` com ~22 colunas, 8KB, sem PII significativo. **Nada a reduzir aqui.**

**Achados pontuais:**

| # | Achado | Local | Severidade | Recomendação |
|---|--------|-------|------------|--------------|
| 4.1.a | Colunas adicionadas via migração `ALTER TABLE` em `init_db()` estão **duplicadas** com o modelo SQLAlchemy `Settings` | `apps/core/database/models.py:12-49` vs `:84-149` | Média (manutenção) | Consolidar defaults em um único ponto |
| 4.1.b | `apps/core/.gitignore` **não tem `.env`** | `apps/core/.gitignore` | Média | Adicionar `.env*` |
| 4.1.c | DB sem `VACUUM` periódico | `models.py` | Baixa | Adicionar job de manutenção |

### 4.2 Node-Core JSON Store (`node-core-store.json`)

**Dados que crescem sem TTL:**

| Campo | Limite atual | Problema | Recomendação |
|-------|--------------|----------|--------------|
| `thread_messages[threadId]` | 500 msgs/thread (FIFO) | **Sem limpeza temporal** — threads antigos ficam para sempre | Adicionar TTL (ex: 90 dias) ou "Clear threads older than X" |
| `session_titles` | Ilimitado | Cresce com sessões | Limitar a 200 sessões |
| `reminders` | Ilimitado | `clear_all_reminders` é manual | Auto-purge de reminders expirados > 30 dias |
| `extensions` (metadata) | Ilimitado | Pode acumular entries de extensions desinstaladas | Limpar entries órfãs no startup |
| `skillKeywords` | Ilimitado | Re-populado a cada start | OK |

**Dados potencialmente desnecessários / debug:**

| Campo | Conteúdo | Recomendação |
|-------|----------|--------------|
| `init_status` | Status de inicialização do app | Pode ficar; OK |
| `economy` | Estado do modo gaming | Pode ficar; OK |

### 4.3 Arquivo de mensagens (`messages.json`)

**É uma cópia serializada** de `node-core-store.json → thread_messages`, criada periodicamente por `saveMessages()`. **Duplicação pura** — pode ser removido se houver garantia de que `node-core-store.json` é sempre a fonte de verdade.

**Recomendação:** Eliminar `messages.json` ou transformá-lo em backup criptografado on-demand.

### 4.4 Observability metrics (`observability-metrics.json`)

Limite de 2000 traces em buffer circular. **OK**, mas exposto em `<userData>/data/` — qualquer um que abrir o arquivo vê métricas de uso. **Baixa sensibilidade**, mas:
- Recomendação: mover para `<userData>/cache/` (mais coerente com "cache") ou adicionar opt-out no settings.

### 4.5 Históricos WhatsApp

- `chat_history-<phone>.json` — **apenas 3 conversas mais recentes** (50 msgs cada). **OK.**
- `whitelist-<phone>.json`, `disabled_contacts-<phone>.json` — importantes. **OK.**

### 4.6 Resumo de Reduções Recomendadas

| Banco/Arquivo | Tamanho Atual Estimado | Após Redução | Como |
|---------------|------------------------|--------------|------|
| `node-core-store.json` | Ilimitado (cresce) | Cap em ~5MB | Adicionar TTL de 90 dias para threads inativos |
| `messages.json` | Cópia completa do store | **0 bytes** (removido) | Remover lógica de `saveMessages()` redundante |
| `observability-metrics.json` | até ~5MB | até ~5MB (manter) | Mover para `cache/` e adicionar opt-out |
| `apps/core/momai.db` | ~8KB | ~8KB (manter) | Nenhuma |
| LanceDB (`semantic/lancedb/`) | Dezenas MB-GB | Manter | Nenhuma (dados do usuário) |
| Cache HF (Whisper) | 150MB-1.5GB | **Configurável** | Adicionar env var `HF_HOME` para apontar a `<userData>/cache/huggingface/` |

---

## 5. Resposta à Pergunta 3: **Unificação e Segurança dos Bancos**

### 5.1 Situação Atual: **3 bancos/formatos heterogêneos**

| Banco | Onde | Quem lê | Quem escreve | Formato |
|-------|------|---------|--------------|---------|
| **SQLite (`momai.db`)** | `apps/core/momai.db` (dev) ou `<userData>/momai.db` (prod) | Python sidecar (read-only) | **Node/Electron** (write) | SQLAlchemy/SQLite |
| **JSON (`node-core-store.json`)** | `<userData>/data/` | Node Core + Electron | Node Core | Plain JSON |
| **JSON (`messages.json`)** | `<userData>/data/` | (nunca lido — só backup) | Node Core (backup redundante) | Plain JSON |
| **LanceDB (`lancedb/`)** | `<userData>/data/semantic/lancedb/` | Node Core | Node Core | LanceDB columnar |

**Problemas:**
- **Duplicação de settings:** `node-core-store.json.settings` e `apps/core/momai.db.settings (tabela)` mantêm os mesmos campos. Risco de divergência.
- **`messages.json` é cópia morta:** apenas backup; nunca é relido se `node-core-store.json` existir.
- **Python sidecar é read-only do DB:** o DB é escrito pelo Node, lido pelo Python. Acoplamento implícito.

### 5.2 Proposta de Unificação

#### Opção A: **Manter heterogêneo mas explícito** (mínima invasão)

Manter 3 bancos, mas:
1. **Eliminar `messages.json`** — remover `saveMessages()` em `infrastructure/store.js:174-180`. O store principal já é persistido a cada debounce.
2. **Mover `assistant_persona` e `user_name` para JSON store** e remover do SQLite, OU **manter apenas no SQLite** como source-of-truth e fazer o Node ler dele.
3. **Definir contrato único**:
   - `momai.db` = configurações do app (settings + flags)
   - `node-core-store.json` = estado mutável (reminders, sessions, extensions, skills)
   - `lancedb/` = embeddings (imutável uma vez criado)
4. **Centralizar schema em TypeScript types** (`apps/momai/scripts/node-core/types/store.ts`) e gerar Pydantic models a partir dele (ou vice-versa).

#### Opção B: **Unificar tudo em SQLite** (recomendada para médio prazo)

Migrar `node-core-store.json` para SQLite (Electron tem `better-sqlite3`):

**Vantagens:**
- ACID real (JSON store tem risco de corrupção em crash)
- Queries SQL em vez de `JSON.parse` + filter
- WAL mode consistente
- Criptografia at-rest nativa via `sqlcipher` (binding Node)
- Backups incrementais

**Estrutura proposta:**

```sql
-- Tabelas principais
settings (id PK, key UNIQUE, value JSON, updated_at)
reminders (id PK, scheduled_time, title, content, repeat_*, is_active, voice_response, created_at)
threads (id PK, title, created_at, last_activity)
messages (id PK, thread_id FK, role, content, created_at, sources JSON, snippets JSON, cards JSON)
extensions (id PK, name, version, manifest JSON, enabled, installed_at)
skill_keywords (skill_id PK, intents JSON, updated_at)

-- Full-text search
CREATE VIRTUAL TABLE messages_fts USING fts5(content, thread_id UNINDEXED, ...)

-- Triggers para auto-prune de TTL
CREATE TRIGGER messages_ttl AFTER INSERT ON messages
BEGIN
  DELETE FROM messages WHERE id IN (
    SELECT id FROM messages
    WHERE thread_id = NEW.thread_id
    ORDER BY created_at DESC
    LIMIT -1 OFFSET 500
  );
END;
```

**Migração:**
- Fase 1: adicionar `better-sqlite3` em paralelo ao JSON store
- Fase 2: dual-write (escreve nos dois, lê do JSON)
- Fase 3: cutover (lê do SQLite, JSON vira backup)
- Fase 4: remover JSON store

#### Opção C: **Unificar via PouchDB/CouchDB-like** (overkill)

Replicação cliente-servidor. **Não recomendado** para MomAI (já é local-first, não precisa de sync).

### 5.3 Plano de Segurança

#### 5.3.1 Criptografia at-rest

| Dado | Hoje | Recomendação |
|------|------|--------------|
| **Baileys auth (WhatsApp)** | 🔴 Plain JSON | **CRÍTICO**: usar `keychain.encryptForStorage()` (já existe!) para criptografar `creds.json`, `app-state-sync-*`, `sender-key-memory-*` com `safeStorage` (chave protegida por DPAPI no Windows, Keychain no macOS, libsecret no Linux) |
| **Notes (`*.md`)** | Plain markdown | Criptografar `<userData>/data/notes/` com AES-256-GCM, chave derivada de passphrase do usuário (ou `safeStorage`) |
| **LanceDB (`lancedb/`)** | Plain LanceDB | Criptografar com SQLCipher-style ou armazenar notas criptografadas ANTES de embedar (vetor cego sem plaintext) |
| **SQLite (`momai.db`)** | Plain SQLite | Migrar para `sqlcipher` binding ou usar `safeStorage` para criptografar valores sensíveis (`user_name`, `assistant_persona`) |
| **JSON store** | Plain JSON | Criptografar via `safeStorage` ou migrar para SQLite criptografado |
| **localStorage** | Plain (Chromium) | Habilitar Chromium encryption at-rest (Windows: DPAPI já é usado pelo Chromium) — OK |

#### 5.3.2 Permissões de arquivo

**Hoje:** Arquivos criados com permissões default do OS (geralmente `0644` em Unix, herdado no Windows).

**Recomendação:**
- Linux/macOS: `fs.chmod(path, 0o600)` em todos os arquivos sensíveis (Node side)
- Windows: usar ACLs (`icacls`) para limitar a usuário atual apenas
- Implementar wrapper `secureWriteFile(path, data)` em `apps/momai/src/main/security/`

#### 5.3.3 Retenção e TTL

| Dado | Política atual | Recomendação |
|------|----------------|--------------|
| Mensagens de chat | Max 500/thread, sem TTL | **TTL de 90 dias** para threads inativos + opt-in "save forever" por thread |
| Observability metrics | Buffer circular 2000 | Manter + mover para `cache/` |
| Logs | Rotação 5MB | Adicionar **sanitização** (remover trechos de mensagens e paths de usuário) |
| Baileys auth | Sem TTL | OK (precisa estar lá enquanto logado) |
| Embeddings LanceDB | Sem TTL | **Hard delete** quando nota é deletada (hoje é overwrite no próximo sync ≤30s — OK mas melhorar) |
| Notes | Sem TTL | OK (dados do usuário) |

#### 5.3.4 Auditoria e logging

**Hoje:** `electron-log` salva em `<userData>/logs/main.log` com rotação.

**Recomendação:**
- Adicionar **redaction layer** que filtra PII antes de gravar
- Categorizar logs em `<userData>/logs/{main,chat,extensions,errors}.log`
- Expor endpoint de "Export my data" (LGPD/GDPR compliance)
- Expor endpoint de "Delete all my data" (botão de pânico)

#### 5.3.5 Configuração de HuggingFace cache (resolver problema #2)

**Hoje:** Whisper usa cache global em `~/.cache/huggingface/hub/`.

**Recomendação:** Em `apps/core/app_state.py` ou `services/voice/`, antes de instanciar Whisper:

```python
import os
from pathlib import Path
os.environ.setdefault("HF_HOME", str(Path(os.environ["MOMAI_DATA_DIR"]) / "cache" / "huggingface"))
```

Isso move o cache para `<userData>/cache/huggingface/`, que:
- ✅ É removido no uninstall NSIS
- ✅ Não polui o profile do usuário
- ✅ Permite múltiplas variants (dev/store) coexistirem

Adicionar ao uninstaller:
```nsh
RMDir /r "$APPDATA\MomAI\cache\huggingface"  ; HF cache redirecionado
```

---

## 6. Achados Críticos Detalhados

### 🔴 Problema #1: Credenciais WhatsApp em plain JSON

**Localização:** `<userData>/data/extensions/whatsapp/baileys-auth/`

**Arquivos críticos:**
- `creds.json` — contém `noiseKey`, `signedIdentityKey`, `signedPreKey`, `registrationId`, `me.id`, `me.name`, `me.lid`
- `app-state-sync-*.json` — chaves de estado Signal
- `sender-key-memory-*.json` — chaves de grupo
- `pre-key-*.json` — pre-keys Signal

**Risco:** Quem obtiver acesso ao disco (laptop roubado, backup em cloud sync, etc.) pode **se passar pelo usuário** no WhatsApp.

**Wrapper `safeStorage` já existe** mas é placeholder (`src/main/security/keychain.ts:1-23`):
```ts
export function encryptForStorage(plain: string): Buffer { ... }
```

**Fix recomendado:**

1. Em `apps/momai/scripts/skills/packaged/whatsapp/background-worker.js`:
   - Antes de salvar: `safeStorage.encryptString(JSON.stringify(creds))` → write `<file>.enc`
   - Ao ler: `safeStorage.decryptString(fs.readFileSync('<file>.enc'))`
2. Manter fallback para `safeStorage.isEncryptionAvailable() === false` (escrever em plain + warning ao usuário)
3. Documentar no manifest: "Encryption is OS-dependent; on Linux requires libsecret"

### 🔴 Problema #2: Cache HF Whisper fora do userData

**Localização:** `%USERPROFILE%\.cache\huggingface\hub\` (Windows) / `~/.cache/huggingface/hub/` (Unix)

**Por que existe:** `faster-whisper` usa `huggingface-hub`, cujo `HF_HOME` default é `~/.cache/huggingface/`.

**Risco:** Privacy fingerprint — alguém que acesse o disco sabe que o usuário roda Whisper localmente. Modelos podem totalizar 1.5GB+ (`tiny`, `base`, `small`, `medium`, `large-v3`).

**Fix:** Definir `HF_HOME = <userData>/cache/huggingface/` no startup do Python sidecar (já temos `MOMAI_DATA_DIR`).

### 🔴 Problema #3: `safeStorage` é placeholder

**Localização:** `apps/momai/src/main/security/keychain.ts`

**Estado atual:** Funções `encryptForStorage`/`decryptFromStorage` implementadas, mas **nenhum consumidor real** (`grep` mostra uso apenas em `coreManager.ts:511-515` com comentário "if a future feature needs to encrypt/decrypt secrets").

**Fix:** É justamente o que resolve o Problema #1.

---

## 7. Achados Médios

### 🟡 Problema #4: Variants órfãs na desinstalação

**Hoje:** `installer.nsh:196` apaga apenas `$APPDATA\MomAI`. Variants `MomAI-Dev`, `MomAI-Store`, `MomAI-Teste` ficam.

**Fix no `installer.nsh`:**

```nsh
; Limpar todas as variants
RMDir /r "$APPDATA\MomAI"
RMDir /r "$APPDATA\MomAI-Dev"
RMDir /r "$APPDATA\MomAI-Store"
RMDir /r "$APPDATA\MomAI-Teste"
RMDir /r "$LOCALAPPDATA\MomAI"
RMDir /r "$LOCALAPPDATA\MomAI-Dev"
RMDir /r "$LOCALAPPDATA\MomAI-Store"
RMDir /r "$LOCALAPPDATA\MomAI-Teste"
RMDir /r "$LOCALAPPDATA\MomAI-updater"

; Auto-start registry cleanup (defense-in-depth)
DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MomAI"
DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.wesleyqdev.momai"
DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "MomAI"
DeleteRegKey HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "MomAI"
```

### 🟡 Problema #5: Auto-start não é removido explicitamente

O `electron-builder` default remove a chave de Run, mas o script custom sobrescreve o `customUnInstall` e **não cita cleanup de auto-start**. Vale adicionar (ver fix acima).

### 🟡 Problema #6: Duplicação de settings entre Node JSON e Python SQLite

**Sintoma:** `node-core-store.json` e `apps/core/momai.db (tabela settings)` mantêm a mesma info. O Electron lê dos dois lados.

**Fix:** Escolher uma fonte de verdade. Recomendação:
- Manter `momai.db` como source-of-truth (já é o "banco oficial" do app)
- Node Core lê do DB via IPC dedicado (`/settings/get`, `/settings/patch`)
- Eliminar duplicação de `node-core-store.json.settings`

### 🟡 Problema #7: `user_name` e `assistant_persona` em texto plano

**Hoje:** `apps/core/momai.db` armazena em plain text.

**Risco:** Baixo (PII leve, é só um nome), mas para defender-se do princípio "data minimization at rest":

**Fix:** Criptografar colunas sensíveis com `safeStorage` (se DB migrar para JSON) ou usar `sqlcipher` (se manter SQLite).

### 🟡 Problema #8: Sem TTL em mensagens de chat

**Hoje:** `MAX_MESSAGES_PER_THREAD = 500` (FIFO).

**Fix:** Adicionar `MESSAGE_RETENTION_DAYS = 90` (configurável), com cleanup diário.

### 🟡 Problema #9: `apps/core/.gitignore` sem `.env`

**Fix:** Adicionar linha 31 (antes de `bin/`):
```
.env
.env.*
```

---

## 8. Plano de Ação Recomendado (Priorizado)

### Sprint 1 (1-2 dias) — Correções Críticas

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 1 | Criptografar Baileys auth com `safeStorage` | `apps/momai/scripts/skills/packaged/whatsapp/background-worker.js:158,891` | 4-6h |
| 2 | Redirecionar HF_HOME para `<userData>/cache/huggingface/` | `apps/core/app_state.py:1-50` | 1h |
| 3 | Limpar variants órfãs no uninstall + auto-start registry | `apps/momai/build/installer.nsh:177-200` | 1h |
| 4 | Adicionar `.env*` ao `apps/core/.gitignore` | `apps/core/.gitignore` | 5min |

### Sprint 2 (3-5 dias) — Redução de dados

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 5 | Adicionar TTL de 90 dias para threads inativos | `apps/momai/scripts/node-core/infrastructure/store.js:174-180` | 4h |
| 6 | Remover `messages.json` (cópia morta) | `apps/momai/scripts/node-core/infrastructure/store.js:174-180` | 2h |
| 7 | Mover `observability-metrics.json` para `cache/` | `apps/momai/scripts/node-core/services/observability-service.js:5-6` | 1h |
| 8 | Sanitizar logs (redaction de PII) | `apps/momai/src/main/logger.ts` | 4h |
| 9 | Adicionar auto-purge de reminders expirados > 30 dias | `apps/momai/scripts/node-core/services/reminder-service.js` | 2h |
| 10 | Endpoints "Export my data" / "Delete all my data" (LGPD) | `apps/momai/scripts/node-core/api/routes/` | 8h |

### Sprint 3 (1-2 semanas) — Unificação e criptografia

| # | Tarefa | Esforço |
|---|--------|---------|
| 11 | Unificar `momai.db` + `node-core-store.json` (escolher source-of-truth) | 2-3 dias |
| 12 | Criptografar notes (`*.md`) com AES-256-GCM + `safeStorage` | 1-2 dias |
| 13 | Criptografar embeddings LanceDB (opção: cifrar antes de embedar) | 3-5 dias |
| 14 | Migrar `node-core-store.json` → SQLite (se Opção B) | 1-2 semanas |
| 15 | Implementar `secureWriteFile` wrapper (permissões 0600) | 1 dia |

### Sprint 4 (ongoing) — Compliance e UX

| # | Tarefa | Esforço |
|---|--------|---------|
| 16 | Botão "Reset all my data" no Settings UI | 4h |
| 17 | Tela "Privacy & Data" explicando o que é armazenado | 4h |
| 18 | Documentar política de retenção na política de privacidade | 2h |
| 19 | CI check: garantir que nenhum `.env*` seja commitado | 2h |

---

## 9. Anexo: Referências de Código

| Categoria | Arquivo:linha |
|-----------|---------------|
| userData setup | `apps/momai/src/main/apply-variant-env.ts:17-19` |
| Variants | `apps/momai/src/main/variants.ts:15-60` |
| Uninstaller NSIS | `apps/momai/build/installer.nsh:177-200` |
| Installer NSIS (reinstall) | `apps/momai/build/installer.nsh:17-111` |
| electron-builder config | `apps/momai/electron-builder.yml:1-169` |
| Logs | `apps/momai/src/main/logger.ts:9,22-28` |
| Node Core store | `apps/momai/scripts/node-core/infrastructure/store.js:5-6,164,174-180` |
| Notes (main) | `apps/momai/src/main/notesService.ts:45-49,263,341-355` |
| Notes (node-core) | `apps/momai/scripts/node-core/domain/note-manager.js:13-46` |
| WhatsApp auth | `apps/momai/scripts/skills/packaged/whatsapp/background-worker.js:158,891,894` |
| WhatsApp storage | `apps/momai/scripts/skills/packaged/whatsapp/background-worker.js:80-85,455-473,799-833` |
| Extensions install/uninstall | `apps/momai/scripts/node-core/api/routes/extensions.routes.js:353-494,552-585,781-816` |
| Models | `apps/momai/src/main/coreManager.ts:367`; `scripts/node-core/services/model-downloader.js:32,122-127` |
| Semantic DB | `apps/momai/scripts/node-core/services/semantic-engine.js:117-150,193,244-264,373-445` |
| Python venv/cache | `apps/momai/src/main/python/bootstrap/uv-runner.ts:18-19,33-41` |
| Economy prefs | `apps/momai/src/main/coreManager.ts:126`; `windowManager.ts:193,207` |
| Onboarding | `apps/momai/src/main/python/bootstrap/index.ts:35,56` |
| Observability | `apps/momai/scripts/node-core/services/observability-service.js:5-6,34` |
| LocalStorage (renderer) | `apps/momai/src/renderer/.../useSettingsCard.ts:125-342`; `useAutocomplete.ts:14-28`; `OnboardingCard.tsx:234-354`; `LateralBar.tsx:95-141`; `DeveloperTab.tsx:42-241`; `WelcomeTips.tsx:29-194`; `useAppTheme.ts:7-16`; `useAppInitialization.ts:8-129`; `i18n/index.tsx:44-49`; `useNotes.ts:147-159` |
| SafeStorage (keychain) | `apps/momai/src/main/security/keychain.ts:1-23` (placeholder) |
| Login items (auto-start) | `apps/momai/src/main/index.ts:46-56` |
| Auto-updater | `apps/momai/src/main/updater.ts:1,24` |
| SQLite (Python) | `apps/core/database/models.py:12-49,53-75,81-156` |
| Whisper cache | `apps/core/app_state.py:17,228-234` |
| Kokoro TTS | `apps/core/services/voice/tts.py:246-298` |
| Settings allowlist | `apps/momai/scripts/node-core/config/settings-allowlist.js:1-24` |
| Community registry cache | `apps/momai/scripts/node-core/services/community-registry.js:13-21,49` |
| Extension allowlist | `apps/momai/scripts/node-core/config/extension-allowlist.js:1-20` |
| Extension storage quota | `apps/momai/scripts/node-core/services/extension-host-worker.js:17-48` |
| SSRF defense | `apps/momai/scripts/node-core/api/routes/extensions.routes.js:34-66` |
| Variants userData | `apps/momai/src/main/python/bootstrap/env-resolver.ts:7-71` |
| MSIX userData redirect | `apps/momai/src/main/python/bootstrap/env-resolver.ts:7-71` |

---

## 10. Conclusão

A MomAI tem uma base sólida de privacidade, mas precisa de **3 correções críticas** (criptografia Baileys, redirecionamento HF cache, uso efetivo de `safeStorage`) e de **limpeza dos pontos órfãos de variants** no uninstall. O roadmap de unificação de bancos (Sprint 3) é o investimento de médio prazo que dará o maior salto em manutenibilidade e segurança.

**TL;DR para o dev:**
1. Criptografar Baileys com `safeStorage` (já existe, é só usar)
2. Mover `HF_HOME` para dentro do userData
3. Limpar variants órfãs + auto-start no NSIS
4. Adicionar `.env*` ao `.gitignore` do core
5. Plano de unificação: remover `messages.json`, escolher source-of-truth entre JSON/SQLite
