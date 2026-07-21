# MomAI Privacy & Data Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir a superfície de dados persistidos pela MomAI, garantir limpeza completa na desinstalação (incluindo variants órfãs e cache de Whisper), criptografar credenciais sensíveis (Baileys), unificar bancos e expor controles de privacidade ao usuário.

**Architecture:**
1. **Fase 1 — Críticos (1-2 dias):** corrigir o uninstaller NSIS para limpar variants órfãs + auto-start + HF cache, redirecionar `HF_HOME` para o userData, criptografar credenciais Baileys com `safeStorage`, e ajustar `.gitignore`.
2. **Fase 2 — Redução (3-5 dias):** remover `messages.json` (cópia morta), adicionar TTL de 90 dias para threads inativos, auto-purge de reminders expirados, mover `observability-metrics.json` para `cache/`, e sanitizar logs (redaction de PII).
3. **Fase 3 — Unificação e criptografia (1-2 semanas):** consolidar `node-core-store.json` + `momai.db` em um único SQLite (Node-side), criptografar notes com AES-256-GCM derivado de `safeStorage`, wrapper `secureWriteFile` (0600).
4. **Fase 4 — UX & Compliance (ongoing):** botão "Reset all my data", tela "Privacy & Data" transparente, endpoints `Export my data` / `Delete my data` (LGPD), atualizar política de privacidade, CI check anti-commit de `.env*`.

**Tech Stack:** Electron 42 · electron-builder 26 · NSIS 3.x · Node.js 22 · Python 3.12+ · SQLAlchemy 2 · better-sqlite3 (a introduzir) · safeStorage (Electron) · AES-256-GCM (Node crypto) · LanceDB 0.27

**Report de origem:** `artifacts/reports/auditorias/auditoria-persistencia-bancos-seguranca-2026-06-23.md`

---

## Pré-requisitos

- [ ] Branch atual `main` está limpa (`git status`)
- [ ] Build local funciona: `pnpm install && cd apps/momai && pnpm build:unpack`
- [ ] Python venv ativo: `cd apps/core && uv sync`
- [ ] Lint e typecheck passam: `cd apps/momai && pnpm typecheck && pnpm lint`
- [ ] Acesso ao repo externo `WesleyQDev/momai-whatsapp-extension` (Task 6)
- [ ] `gh` CLI autenticado (`gh auth status`)

---

# FASE 1 — Correções Críticas (1-2 dias)

> **Escopo:** 6 tasks. Cada uma isolada, testável, committable individualmente.
> Bloqueia: nada. Outras tasks podem ser feitas em paralelo.
> Após Fase 1: NSIS remove TUDO (variants + auto-start + HF cache), Baileys é criptografado, `HF_HOME` está dentro do userData.

---

## Task 1.1: Adicionar `.env*` ao `.gitignore` da core

**Files:**
- Modify: `apps/core/.gitignore:1-30`

- [ ] **Step 1: Editar `.gitignore` da core**

Em `apps/core/.gitignore`, adicionar (em qualquer lugar lógico, recomendado após linha 11):

```
# Environment files (never commit secrets)
.env
.env.*
!.env.example
```

- [ ] **Step 2: Verificar que nenhum `.env` real está tracked**

Run: `cd apps/core && git ls-files | grep -E "^\.env"`
Expected: VAZIO (nenhum `.env` real commitado)

- [ ] **Step 3: Confirmar que `apps/momai/.env` e similares continuam ignorados pelo gitignore raiz**

Run: `git check-ignore apps/momai/.env apps/core/.env`
Expected: ambos paths reportados como "ignored"

- [ ] **Step 4: Commit**

```bash
git add apps/core/.gitignore
git commit -m "chore(core): protect .env* from accidental commit (S001)"
```

---

## Task 1.2: Limpar variants órfãs + auto-start + cache HF no uninstaller NSIS

**Files:**
- Modify: `apps/momai/build/installer.nsh:177-200` (macro `customUnInstall`)
- Modify: `apps/momai/build/installer.nsh:95-111` (macro `customInit`, branch de "clear data on reinstall")

- [ ] **Step 1: Atualizar `customUnInstall` para limpar todas as variants + auto-start**

Substituir `apps/momai/build/installer.nsh:177-200` por:

```nsh
; ========================
; UNINSTALLER — User data cleanup
; Cleans: all variants, HF cache, auto-start registry, updater cache
; ========================
!macro customUnInstall
  ; Kill MomAI and related processes before removing anything
  nsExec::ExecToLog 'taskkill /f /im MomAI.exe'
  nsExec::ExecToLog 'taskkill /f /im python.exe /fi "WINDOWTITLE eq momai*"'
  nsExec::ExecToLog 'taskkill /f /im llama-server.exe'
  Sleep 2000

  ; Detect update via electron-updater flag (preserves userData)
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    ; If this is an update, do not delete user data
    Return
  ${EndIf}

  ; Detect manual update: if installed version != current, it's an upgrade → preserve
  ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  ${If} $R2 == ""
    ReadRegStr $R2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  ${EndIf}
  ${If} $R2 == ""
    ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
  ${EndIf}
  ${If} $R2 == ""
    ReadRegStr $R2 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
  ${EndIf}
  ${If} $R2 != ""
  ${AndIf} $R2 != "${VERSION}"
    ; Manual upgrade (different version, no --updated flag) → preserve userData
    Return
  ${EndIf}

  ; Real uninstall: clean ALL variants
  RMDir /r "$APPDATA\desktop"
  RMDir /r "$LOCALAPPDATA\desktop"

  ; All userData variants (NSIS + Dev + Store + Teste)
  RMDir /r "$APPDATA\MomAI"
  RMDir /r "$APPDATA\MomAI-Dev"
  RMDir /r "$APPDATA\MomAI-Store"
  RMDir /r "$APPDATA\MomAI-Teste"

  RMDir /r "$LOCALAPPDATA\MomAI"
  RMDir /r "$LOCALAPPDATA\MomAI-Dev"
  RMDir /r "$LOCALAPPDATA\MomAI-Store"
  RMDir /r "$LOCALAPPDATA\MomAI-Teste"

  ; Updater cache (any variant suffix)
  RMDir /r "$LOCALAPPDATA\MomAI-updater"

  ; Auto-start registry cleanup (defense-in-depth)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MomAI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.wesleyqdev.momai"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "MomAI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "MomAI"

  ; Global HuggingFace cache (defense-in-depth in case HF_HOME redirect didn't apply)
  RMDir /r "$LOCALAPPDATA\huggingface"
  RMDir /r "$APPDATA\huggingface"
!macroend
```

- [ ] **Step 2: Atualizar `customInit` para limpar todas as variants no reinstall**

Substituir `apps/momai/build/installer.nsh:103-110` por:

```nsh
    ; clear old installations data (all variants)
    RMDir /r "$APPDATA\desktop"
    RMDir /r "$LOCALAPPDATA\desktop"

    ; userData path: %APPDATA%\MomAI and all variants
    RMDir /r "$APPDATA\MomAI"
    RMDir /r "$APPDATA\MomAI-Dev"
    RMDir /r "$APPDATA\MomAI-Store"
    RMDir /r "$APPDATA\MomAI-Teste"
    RMDir /r "$LOCALAPPDATA\MomAI"
    RMDir /r "$LOCALAPPDATA\MomAI-Dev"
    RMDir /r "$LOCALAPPDATA\MomAI-Store"
    RMDir /r "$LOCALAPPDATA\MomAI-Teste"
    RMDir /r "$LOCALAPPDATA\MomAI-updater"

    ; Global HuggingFace cache
    RMDir /r "$LOCALAPPDATA\huggingface"
    RMDir /r "$APPDATA\huggingface"
```

- [ ] **Step 3: Smoke test — build do instalador**

Run: `cd apps/momai && pnpm build:unpack`
Expected: build succeeds, `dist/win-unpacked/Uninstall MomAI.exe` existe

- [ ] **Step 4: Smoke test — verificar que `Uninstall.exe` referencia os novos paths**

Run (PowerShell):
```powershell
$bytes = [System.IO.File]::ReadAllBytes("apps/momai\dist\win-unpacked\Uninstall MomAI.exe")
$strings = [System.Text.Encoding]::ASCII.GetString($bytes) -split "`0" | Where-Object { $_ -match "MomAI-Store|MomAI-Teste|MomAI-Dev|huggingface" }
$strings | Select-Object -First 20
```
Expected: pelo menos `MomAI-Store`, `MomAI-Teste`, `MomAI-Dev`, `huggingface` aparecem (significa que o script compilou)

- [ ] **Step 5: Commit**

```bash
git add apps/momai/build/installer.nsh
git commit -m "fix(installer): clean all variants, auto-start, and HF cache on uninstall (S002)"
```

---

## Task 1.3: Adicionar handler IPC de criptografia no main process

**Files:**
- Create: `apps/momai/src/main/ipc/secure-storage-handler.ts`
- Create: `apps/momai/src/main/ipc/secure-storage-handler.test.ts`
- Modify: `apps/momai/src/main/index.ts:1-80` (registrar o handler)

> Note: `apps/momai/src/main/security/keychain.ts` already has the main-process helpers `isEncryptionAvailable`, `encryptForStorage`, `decryptFromStorage` that the handler complements. The new IPC handler is intentionally separate to expose this to subprocess workers, not to replace the existing main-process API.

- [ ] **Step 1: Escrever teste para o handler de criptografia**

Criar `apps/momai/src/main/ipc/secure-storage-handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from('enc:' + s)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('enc:', '')),
  },
}))

import { ipcMain, safeStorage } from 'electron'
import { registerSecureStorageHandlers } from './secure-storage-handler'

describe('secure-storage-handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers two IPC handlers: encrypt and decrypt', () => {
    registerSecureStorageHandlers()
    expect(ipcMain.handle).toHaveBeenCalledWith('secure-storage:encrypt', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('secure-storage:decrypt', expect.any(Function))
  })

  it('encrypt handler returns null when safeStorage unavailable', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)
    registerSecureStorageHandlers()
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'secure-storage:encrypt')?.[1] as any
    expect(await handler({}, 'hello')).toBeNull()
  })

  it('encrypt handler returns Buffer when safeStorage available', async () => {
    registerSecureStorageHandlers()
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'secure-storage:encrypt')?.[1] as any
    const result = await handler({}, 'hello')
    expect(result).toBeInstanceOf(Buffer)
    expect(result?.toString()).toBe('enc:hello')
  })

  it('decrypt handler returns string when safeStorage available', async () => {
    registerSecureStorageHandlers()
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'secure-storage:decrypt')?.[1] as any
    const result = await handler({}, Buffer.from('enc:hello'))
    expect(result).toBe('hello')
  })
})
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `cd apps/momai && pnpm test -- secure-storage-handler`
Expected: FAIL — "Cannot find module './secure-storage-handler'"

- [ ] **Step 3: Criar o handler**

Criar `apps/momai/src/main/ipc/secure-storage-handler.ts`:

```ts
import { ipcMain, safeStorage } from 'electron'
import { logger } from '../logger'

/**
 * IPC handlers that allow subprocess workers (e.g. WhatsApp extension)
 * to encrypt/decrypt secrets using the OS keychain (DPAPI / Keychain / libsecret).
 *
 * Returns null on encryption failure (caller should fall back to plain + warn).
 */
export function registerSecureStorageHandlers(): void {
  ipcMain.handle('secure-storage:encrypt', async (_event, plain: string): Promise<Buffer | null> => {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('[secure-storage] OS keychain not available, refusing to encrypt')
      return null
    }
    try {
      return safeStorage.encryptString(plain)
    } catch (e) {
      logger.error('[secure-storage] encrypt failed', e)
      return null
    }
  })

  ipcMain.handle('secure-storage:decrypt', async (_event, encrypted: Buffer): Promise<string | null> => {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn('[secure-storage] OS keychain not available, refusing to decrypt')
      return null
    }
    try {
      return safeStorage.decryptString(encrypted)
    } catch (e) {
      logger.error('[secure-storage] decrypt failed', e)
      return null
    }
  })
}
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `cd apps/momai && pnpm test -- secure-storage-handler`
Expected: PASS (4 tests)

- [ ] **Step 5: Registrar handler no startup do main process**

Em `apps/momai/src/main/index.ts`, adicionar import e chamada. Localizar onde outros handlers IPC são registrados (procure por `ipcMain.handle`) e adicionar:

```ts
import { registerSecureStorageHandlers } from './ipc/secure-storage-handler'

// ... junto com outros ipcMain.handle:
registerSecureStorageHandlers()
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/momai && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/momai/src/main/ipc/secure-storage-handler.ts \
        apps/momai/src/main/ipc/secure-storage-handler.test.ts \
        apps/momai/src/main/index.ts
git commit -m "feat(security): expose safeStorage over IPC for subprocess workers (S003)"
```

---

## Task 1.4: Redirecionar `HF_HOME` para o userData

**Files:**
- Modify: `apps/core/app_state.py:1-50`

- [ ] **Step 1: Adicionar teste de import + env var**

Criar `apps/core/tests/test_hf_home_redirect.py`:

```python
import os
import sys
from pathlib import Path


def test_app_state_sets_hf_home(monkeypatch, tmp_path):
    data_dir = tmp_path / "momai"
    data_dir.mkdir()
    monkeypatch.setenv("MOMAI_DATA_DIR", str(data_dir))

    # Re-import to trigger the module-level HF_HOME set
    if "app_state" in sys.modules:
        del sys.modules["app_state"]
    import app_state  # noqa: F401

    expected = str(data_dir / "cache" / "huggingface")
    assert os.environ.get("HF_HOME") == expected, (
        f"HF_HOME not set. Expected {expected}, got {os.environ.get('HF_HOME')}"
    )
    assert Path(expected).parent.exists(), "cache/huggingface dir not created"
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `cd apps/core && uv run pytest tests/test_hf_home_redirect.py -v`
Expected: FAIL — `AssertionError: HF_HOME not set`

- [ ] **Step 3: Editar `app_state.py` para setar `HF_HOME`**

Em `apps/core/app_state.py`, no topo do arquivo (após imports), adicionar:

```python
import os
from pathlib import Path

# Redirect HuggingFace cache to userData so it survives uninstall cleanup
# and doesn't pollute the user's global profile.
if "MOMAI_DATA_DIR" in os.environ and "HF_HOME" not in os.environ:
    _hf_home = Path(os.environ["MOMAI_DATA_DIR"]) / "cache" / "huggingface"
    _hf_home.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(_hf_home)
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `cd apps/core && uv run pytest tests/test_hf_home_redirect.py -v`
Expected: PASS

- [ ] **Step 5: Rodar suite completa da core**

Run: `cd apps/core && uv run pytest`
Expected: todos os testes existentes continuam passando

- [ ] **Step 6: Commit**

```bash
git add apps/core/app_state.py apps/core/tests/test_hf_home_redirect.py
git commit -m "fix(core): redirect HF_HOME to userData/cache/huggingface (S004)"
```

---

## Task 1.5: Criptografar credenciais Baileys com safeStorage

> **Esta task toca uma SKILL EMPACOTADA**. Conforme regra crítica do `AGENTS.md`, ao final desta task, **deve-se também sincronizar com o repo externo `WesleyQDev/momai-whatsapp-extension`** (Task 1.6).

**Files:**
- Create: `apps/momai/scripts/skills/packaged/whatsapp/secure-storage-bridge.js`
- Create: `apps/momai/scripts/skills/packaged/whatsapp/baileys-cred-migration.js`
- Create: `apps/momai/scripts/node-core/tests/baileys-cred-migration.test.js`
- Modify: `apps/momai/scripts/skills/packaged/whatsapp/background-worker.js` (call migration on startup/shutdown)
- Modify: `apps/momai/scripts/node-core/services/extension-host-manager.js` (add sidecar-level secure-storage handlers + RPC pattern)
- Modify: `apps/momai/src/main/coreManager.ts` (add main-process safeStorage handlers)
- Modify: `apps/momai/src/main/core-message-types.ts` (extend discriminated union)

> **Architecture note (3 hops):** the WhatsApp worker is a child process of the Node Core sidecar, which is itself a child of the Electron main process. `safeStorage` only exists in the Electron main process. So the chain is: worker → sidecar (`extension-host-manager.js`) → main process (`coreManager.ts`) → `safeStorage`.

- [ ] **Step 1: Criar bridge `secure-storage-bridge.js` (módulo testável)**

Criar `apps/momai/scripts/skills/packaged/whatsapp/secure-storage-bridge.js`:

```js
const SECURE_STORAGE_TIMEOUT_MS = 5000

function encryptForStorage(plain) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), SECURE_STORAGE_TIMEOUT_MS)
    process.send(
      { type: 'secure-storage:encrypt', payload: { plain } },
      (ack) => {
        clearTimeout(timeout)
        resolve(ack?.ok ? ack.encrypted : null)
      }
    )
  })
}

function decryptFromStorage(encryptedBase64) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), SECURE_STORAGE_TIMEOUT_MS)
    process.send(
      { type: 'secure-storage:decrypt', payload: { encryptedBase64 } },
      (ack) => {
        clearTimeout(timeout)
        resolve(ack?.ok ? ack.plain : null)
      }
    )
  })
}

module.exports = { encryptForStorage, decryptFromStorage }
```

No `background-worker.js`, importar:

```js
const { encryptForStorage, decryptFromStorage } = require('./secure-storage-bridge')
```

- [ ] **Step 2: Adicionar request handler no extension-host-manager**

Modificar `apps/momai/scripts/node-core/services/extension-host-manager.js` (procure pelo switch de tipos de mensagem do worker). Adicionar cases:

```js
case 'secure-storage:encrypt': {
  const { encryptForStorage } = require('../../../main/security/keychain-adapter')  // see note below
  const encrypted = await encryptForStorage(msg.payload.plain)
  sendAck(worker, true, { encrypted: encrypted ? encrypted.toString('base64') : null })
  break
}
case 'secure-storage:decrypt': {
  const { decryptFromStorage } = require('../../../main/security/keychain-adapter')
  const plain = await decryptFromStorage(Buffer.from(msg.payload.encryptedBase64, 'base64'))
  sendAck(worker, true, { plain })
  break
}
```

> **Nota:** criar `apps/momai/src/main/security/keychain-adapter.js` que re-exporta as funções IPC (wrapper para o host Node Core, que não tem acesso direto a `safeStorage` do Electron). Estrutura:

```js
// apps/momai/src/main/security/keychain-adapter.js
const { ipcMain } = require('electron')

const pending = new Map()

ipcMain.on('secure-storage-from-host', (event, requestId, op, payload) => {
  // Forward to renderer/main security handler
})

async function encryptForStorage(plain) {
  // Use Electron safeStorage via the same process (Node Core is child of main)
  const { safeStorage } = require('electron')
  if (!safeStorage.isEncryptionAvailable()) return null
  return safeStorage.encryptString(plain)
}
```

> **Ajuste de arquitetura:** Node Core roda como subprocesso Node.js e **não tem acesso** a `safeStorage` do Electron (que é API do main process). A solução real é: o **extension-host-manager** (que roda no main process) faz a chamada direta, e o worker chama via IPC. O esqueleto acima é ilustrativo; ajuste a integração concreta com base em como `extension-host-manager` já se comunica com workers.

- [ ] **Step 3: Modificar `useMultiFileAuthState` para wrapper criptografado**

Localizar em `background-worker.js:891` (chamada `useMultiFileAuthState`). Substituir por wrapper:

```js
const baseAuth = path.join(DATA_DIR, 'baileys-auth')

async function loadOrCreateCreds() {
  const encPath = path.join(baseAuth, 'creds.json.enc')
  const plainPath = path.join(baseAuth, 'creds.json')

  if (fs.existsSync(encPath)) {
    const encrypted = fs.readFileSync(encPath)
    const plain = await decryptFromStorage(encrypted.toString('base64'))
    if (plain) {
      console.log('[whatsapp] creds.json loaded from encrypted storage')
      return JSON.parse(plain)
    }
    console.warn('[whatsapp] failed to decrypt creds, falling back to plain (file exists)')
    return JSON.parse(fs.readFileSync(plainPath, 'utf-8'))
  }

  // First run: create new creds
  const { state } = await originalUseMultiFileAuthState(baseAuth)
  // Save encrypted version
  const plain = JSON.stringify(state.creds)
  const encrypted = await encryptForStorage(plain)
  if (encrypted) {
    fs.writeFileSync(encPath, Buffer.from(encrypted, 'base64'))
    // Optionally delete plain creds.json
    if (fs.existsSync(plainPath)) fs.unlinkSync(plainPath)
    console.log('[whatsapp] creds.json saved as encrypted')
  } else {
    console.warn('[whatsapp] safeStorage unavailable, creds.json kept in plain (insecure)')
  }
  return state.creds
}
```

- [ ] **Step 4: Migrar credenciais existentes (one-shot migration)**

Adicionar função **exportada** no topo do `background-worker.js` (junto com `encryptForStorage`/`decryptFromStorage`):

```js
async function migratePlainCredsToEncrypted(baseAuth) {
  const plainCreds = path.join(baseAuth, 'creds.json')
  const encCreds = path.join(baseAuth, 'creds.json.enc')
  if (fs.existsSync(plainCreds) && !fs.existsSync(encCreds)) {
    const plain = fs.readFileSync(plainCreds, 'utf-8')
    const encrypted = await encryptForStorage(plain)
    if (encrypted) {
      fs.writeFileSync(encCreds, Buffer.from(encrypted, 'base64'))
      fs.unlinkSync(plainCreds)
      console.log('[whatsapp] migrated plain creds.json → creds.json.enc')
      return true
    }
  }
  return false
}

module.exports = { migratePlainCredsToEncrypted, /* ...outras exports... */ }
```

E chamar no startup do worker (logo após criar `baseAuth`):

```js
await migratePlainCredsToEncrypted(baseAuth)
```

- [ ] **Step 5: Escrever teste de migração**

Criar `apps/momai/scripts/skills/packaged/whatsapp/background-worker.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}))

vi.mock('./secure-storage-bridge', () => ({
  encryptForStorage: vi.fn(async (plain) => Buffer.from('enc:' + plain).toString('base64')),
  decryptFromStorage: vi.fn(async (b64) => Buffer.from(b64, 'base64').toString().replace('enc:', '')),
}))

import fs from 'fs'
import { migratePlainCredsToEncrypted } from './background-worker'

describe('baileys creds migration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('migrates plain creds.json to creds.json.enc when encryption is available', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('creds.json') && !String(p).endsWith('.enc'))
    vi.mocked(fs.readFileSync).mockReturnValue('{"noiseKey":"abc"}')

    const result = await migratePlainCredsToEncrypted('/fake/baileys-auth')

    expect(result).toBe(true)
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('creds.json.enc'),
      expect.any(Buffer)
    )
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('creds.json'))
  })

  it('returns false when plain creds.json does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const result = await migratePlainCredsToEncrypted('/fake/baileys-auth')
    expect(result).toBe(false)
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Rodar testes**

Run: `cd apps/momai && pnpm test -- whatsapp/background-worker`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/momai/scripts/skills/packaged/whatsapp/
git commit -m "feat(whatsapp): encrypt Baileys auth with OS keychain (S005)"
```

---

## Task 1.6: Sincronizar mudança do Baileys com repo externo

> **OBRIGATÓRIO** conforme regra crítica do `AGENTS.md` sobre skills com dois repositórios.

**Files:**
- External: `WesleyQDev/momai-whatsapp-extension` (clonar em `/tmp/momai-whatsapp-extension`)

- [ ] **Step 1: Identificar repo externo via `registry.json`**

Run:
```bash
cat registry.json | grep -A 5 whatsapp
```
Confirmar que `download_url` aponta para `WesleyQDev/momai-whatsapp-extension`

- [ ] **Step 2: Clonar repo externo**

Run:
```bash
gh repo clone WesleyQDev/momai-whatsapp-extension /tmp/momai-whatsapp-extension
```

- [ ] **Step 3: Copiar arquivos modificados**

Run:
```bash
cp apps/momai/scripts/skills/packaged/whatsapp/background-worker.js /tmp/momai-whatsapp-extension/
cp apps/momai/scripts/skills/packaged/whatsapp/manifest.json /tmp/momai-whatsapp-extension/
cp apps/momai/scripts/skills/packaged/whatsapp/SKILL.md /tmp/momai-whatsapp-extension/
```

- [ ] **Step 4: Bump de versão no manifest externo**

Editar `/tmp/momai-whatsapp-extension/manifest.json` — incrementar o campo `version` (patch, ex: 1.2.3 → 1.2.4).

- [ ] **Step 5: Commit + tag no repo externo**

```bash
cd /tmp/momai-whatsapp-extension
git add .
git commit -m "feat: encrypt Baileys auth with OS keychain (S005)"
git tag v$(node -p "require('./manifest.json').version")
git push origin main --tags
```

- [ ] **Step 6: Criar release ZIP no GitHub**

```bash
gh release create v$(node -p "require('./manifest.json').version") \
  --generate-notes \
  --title "v$(node -p "require('./manifest.json').version")"
```

- [ ] **Step 7: Atualizar `registry.json` no monorepo com nova URL/versão**

Em `registry.json`, atualizar o entry `whatsapp`:
- `version`: novo número
- `download_url`: URL do release ZIP criado no Step 6

- [ ] **Step 8: Commit no monorepo**

```bash
git add registry.json
git commit -m "chore(registry): bump whatsapp to v$(node -p "require('/tmp/momai-whatsapp-extension/manifest.json').version")"
git push origin main
```

---

# FASE 2 — Redução de Dados (3-5 dias)

> **Escopo:** 5 tasks. Após Fase 2: dados com TTL, observability em cache/, logs sanitizados.

---

## Task 2.1: Remover `messages.json` (cópia morta)

**Files:**
- Modify: `apps/momai/scripts/node-core/infrastructure/store.js:174-180`
- Modify: `apps/momai/scripts/node-core/infrastructure/store.js:200-220` (qualquer outro ponto que leia)

- [ ] **Step 1: Localizar todas as referências a `messages.json`**

Run:
```bash
grep -rn "messages.json\|saveMessages\|loadMessages" apps/momai/scripts/node-core/ apps/momai/src/
```
Expected: lista de todos os callers

- [ ] **Step 2: Escrever teste de sanidade: garantir que `node-core-store.json` contém todo o histórico**

Criar `apps/momai/scripts/node-core/infrastructure/store.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadStore, saveStore, getMessages, addMessage } from './store'
import path from 'path'
import fs from 'fs'
import os from 'os'

describe('store: messages persist in node-core-store.json (no separate messages.json)', () => {
  it('after adding a message, thread_messages is in the main store, no messages.json is written', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-store-'))
    process.env.MOMAI_DATA_DIR_FOR_TEST = tmp
    // ... init store with test data dir

    await addMessage('thread-1', { role: 'user', content: 'hello' })

    const store = await loadStore()
    expect(store.thread_messages['thread-1']).toHaveLength(1)
    expect(fs.existsSync(path.join(tmp, 'messages.json'))).toBe(false)
  })
})
```

- [ ] **Step 3: Implementar o teste e o setup de test dataDir**

Adicionar helper em `store.js` para usar `MOMAI_DATA_DIR_FOR_TEST` em testes (já existe convenção similar).

- [ ] **Step 4: Rodar teste — deve falhar (porque `saveMessages` ainda cria `messages.json`)**

Run: `cd apps/momai && pnpm test -- infrastructure/store`
Expected: FAIL — `messages.json` ainda é criado

- [ ] **Step 5: Remover a função `saveMessages` e todos os callers**

Em `apps/momai/scripts/node-core/infrastructure/store.js:174-180`:
- Comentar/deletar bloco `function saveMessages()` e suas chamadas

Localizar todas as chamadas (`grep -n "saveMessages(" apps/momai/scripts/node-core/`) e remover.

- [ ] **Step 6: Rodar teste — deve passar**

Run: `cd apps/momai && pnpm test -- infrastructure/store`
Expected: PASS

- [ ] **Step 7: Smoke test manual**

Run: `cd apps/momai && pnpm dev`
- Enviar 1 mensagem no chat
- Fechar app
- Verificar que `<userData>/data/messages.json` **NÃO** existe
- Verificar que `<userData>/data/node-core-store.json` contém a mensagem em `thread_messages`

- [ ] **Step 8: Commit**

```bash
git add apps/momai/scripts/node-core/infrastructure/store.js
git commit -m "refactor(store): remove redundant messages.json backup (R001)"
```

---

## Task 2.2: Adicionar TTL de 90 dias para threads inativos

**Files:**
- Create: `apps/momai/scripts/node-core/infrastructure/retention.js`
- Modify: `apps/momai/scripts/node-core/infrastructure/store.js:1-200` (chamar retenção no startup)
- Modify: `apps/momai/scripts/node-core/config/constants.js` (adicionar `THREAD_RETENTION_DAYS`)

- [ ] **Step 1: Adicionar constante de configuração**

Em `apps/momai/scripts/node-core/config/constants.js`, adicionar:

```js
const THREAD_RETENTION_DAYS = Number(process.env.MOMAI_THREAD_RETENTION_DAYS) || 90
module.exports.THREAD_RETENTION_DAYS = THREAD_RETENTION_DAYS
```

- [ ] **Step 2: Criar função de retenção com teste**

Criar `apps/momai/scripts/node-core/infrastructure/retention.js`:

```js
const { THREAD_RETENTION_DAYS } = require('../config/constants')

function isThreadStale(thread, now = Date.now()) {
  if (!thread || !thread.lastActivity) return false
  const ageDays = (now - new Date(thread.lastActivity).getTime()) / (1000 * 60 * 60 * 24)
  return ageDays > THREAD_RETENTION_DAYS
}

function pruneStaleThreads(store, now = Date.now()) {
  const removed = []
  for (const [threadId, thread] of Object.entries(store.threads || {})) {
    if (isThreadStale(thread, now)) {
      delete store.threads[threadId]
      delete store.thread_messages[threadId]
      delete store.session_titles[threadId]
      removed.push(threadId)
    }
  }
  return removed
}

module.exports = { isThreadStale, pruneStaleThreads }
```

Criar teste `apps/momai/scripts/node-core/infrastructure/retention.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { isThreadStale, pruneStaleThreads } from './retention'

describe('retention', () => {
  const old = '2025-01-01T00:00:00Z'
  const recent = new Date().toISOString()

  it('marks thread as stale when lastActivity is older than 90 days', () => {
    expect(isThreadStale({ lastActivity: old })).toBe(true)
    expect(isThreadStale({ lastActivity: recent })).toBe(false)
    expect(isThreadStale({})).toBe(false)
  })

  it('pruneStaleThreads removes threads, messages, and titles', () => {
    const store = {
      threads: { a: { lastActivity: old }, b: { lastActivity: recent } },
      thread_messages: { a: [{}], b: [{}] },
      session_titles: { a: 'old', b: 'new' },
    }
    const removed = pruneStaleThreads(store)
    expect(removed).toEqual(['a'])
    expect(store.threads).not.toHaveProperty('a')
    expect(store.thread_messages).not.toHaveProperty('a')
    expect(store.session_titles).not.toHaveProperty('a')
    expect(store.threads).toHaveProperty('b')
  })
})
```

- [ ] **Step 3: Rodar testes**

Run: `cd apps/momai && pnpm test -- infrastructure/retention`
Expected: PASS (2 tests)

- [ ] **Step 4: Chamar `pruneStaleThreads` no startup do Node Core**

Em `apps/momai/scripts/node-core/infrastructure/store.js`, na função de inicialização (init/load), adicionar:

```js
const { pruneStaleThreads } = require('./retention')

// In the init function, after loading the store:
const removed = pruneStaleThreads(store)
if (removed.length > 0) {
  console.log(`[retention] Pruned ${removed.length} stale threads (>${THREAD_RETENTION_DAYS} days)`)
  await saveStore()  // persist the cleanup
}
```

- [ ] **Step 5: Typecheck + tests**

Run: `cd apps/momai && pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/momai/scripts/node-core/infrastructure/retention.js \
        apps/momai/scripts/node-core/infrastructure/retention.test.js \
        apps/momai/scripts/node-core/infrastructure/store.js \
        apps/momai/scripts/node-core/config/constants.js
git commit -m "feat(retention): auto-prune threads older than 90 days on startup (R002)"
```

---

## Task 2.3: Auto-purge de reminders expirados

**Files:**
- Modify: `apps/momai/scripts/node-core/services/reminder-service.js:1-100`

- [ ] **Step 1: Localizar `reminder-service.js` e função de salvar**

Run: `grep -n "reminders\|saveReminders" apps/momai/scripts/node-core/services/reminder-service.js | head -20`

- [ ] **Step 2: Adicionar função `purgeExpiredReminders` com teste**

Adicionar em `reminder-service.js`:

```js
const REMINDER_RETENTION_DAYS = Number(process.env.MOMAI_REMINDER_RETENTION_DAYS) || 30

function purgeExpiredReminders(reminders, now = Date.now()) {
  const cutoff = now - REMINDER_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return reminders.filter((r) => {
    if (r.is_active) return true
    const end = r.expires_at || r.scheduled_time
    return new Date(end).getTime() > cutoff
  })
}
```

Teste `reminder-service.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { purgeExpiredReminders } from './reminder-service'

describe('purgeExpiredReminders', () => {
  it('keeps active reminders regardless of age', () => {
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const result = purgeExpiredReminders([
      { id: 1, is_active: true, scheduled_time: old },
    ])
    expect(result).toHaveLength(1)
  })

  it('removes inactive reminders older than 30 days', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const recent = new Date().toISOString()
    const result = purgeExpiredReminders([
      { id: 1, is_active: false, scheduled_time: old },
      { id: 2, is_active: false, scheduled_time: recent },
    ])
    expect(result.map((r) => r.id)).toEqual([2])
  })
})
```

- [ ] **Step 3: Chamar purge no startup e em `clear_all_reminders`**

- [ ] **Step 4: Rodar testes + commit**

```bash
cd apps/momai && pnpm test -- reminder-service
git add ...
git commit -m "feat(reminders): auto-purge expired reminders (>30 days inactive) (R003)"
```

---

## Task 2.4: Mover `observability-metrics.json` para `cache/`

**Files:**
- Modify: `apps/momai/scripts/node-core/services/observability-service.js:5-6,34`
- Modify: `apps/momai/scripts/node-core/config/constants.js` (adicionar `METRICS_FILE`)

- [ ] **Step 1: Mudar path de `<DATA_DIR>/observability-metrics.json` para `<DATA_DIR>/cache/observability-metrics.json`**

- [ ] **Step 2: Adicionar migration no startup: mover arquivo existente, se houver**

```js
const oldPath = path.join(DATA_DIR, 'observability-metrics.json')
const newPath = path.join(DATA_DIR, 'cache', 'observability-metrics.json')
if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
  fs.mkdirSync(path.dirname(newPath), { recursive: true })
  fs.renameSync(oldPath, newPath)
  console.log('[observability] migrated metrics file to cache/')
}
```

- [ ] **Step 3: Atualizar uninstaller para garantir que `cache/` é removido** (já está no Task 1.2)

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(observability): move metrics to cache/ (R004)"
```

---

## Task 2.5: Sanitizar logs (redaction de PII)

**Files:**
- Modify: `apps/momai/src/main/logger.ts:1-100`

- [ ] **Step 1: Adicionar função de sanitização**

```ts
const REDACT_PATTERNS: RegExp[] = [
  /(\buser[_-]?name[=:]\s*)["']?([^"',\s}]+)/gi,
  /(\bapi[_-]?key[=:]\s*)["']?([^"',\s}]+)/gi,
  /(\bpassword[=:]\s*)["']?([^"',\s}]+)/gi,
  /(\btoken[=:]\s*)["']?([^"',\s}]+)/gi,
  /(Bearer\s+)[A-Za-z0-9._-]+/g,
]

export function sanitizeLog(input: string): string {
  let out = input
  for (const pat of REDACT_PATTERNS) {
    out = out.replace(pat, '$1[REDACTED]')
  }
  return out
}
```

- [ ] **Step 2: Teste unitário**

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeLog } from './logger'

describe('sanitizeLog', () => {
  it('redacts user_name, api_key, password, token, bearer', () => {
    expect(sanitizeLog('user_name=john')).toContain('[REDACTED]')
    expect(sanitizeLog('api_key=sk-abc123')).toContain('[REDACTED]')
    expect(sanitizeLog('password=hunter2')).toContain('[REDACTED]')
    expect(sanitizeLog('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toContain('[REDACTED]')
  })

  it('leaves normal text untouched', () => {
    expect(sanitizeLog('Starting model download')).toBe('Starting model download')
  })
})
```

- [ ] **Step 3: Wrap o método de log**

Modificar `logger.ts:22-28` para chamar `sanitizeLog(msg)` antes de gravar.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(logger): redact PII patterns in log output (R005)"
```

---

# FASE 3 — Unificação e Criptografia (1-2 semanas)

> **Escopo:** 5 tasks. Após Fase 3: settings unificados em SQLite, notes criptografadas, permissões 0600.

---

## Task 3.1: Consolidar settings — escolher source-of-truth

**Decisão arquitetural:** manter `node-core-store.json` como source-of-truth (mais simples, não precisa de migração) e fazer a **Core Python ler dele via JSON em vez de SQLite**.

**Files:**
- Modify: `apps/core/api/routes/settings.py` (criar)
- Modify: `apps/core/database/models.py` (manter mas marcar como deprecated para settings)
- Modify: `apps/momai/src/main/coreManager.ts:511-534` (remover dual-write)

- [ ] **Step 1: Criar endpoint FastAPI `/settings/json` que lê `node-core-store.json`**

```python
# apps/core/api/routes/settings.py
import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/settings", tags=["settings"])

def _store_path() -> Path:
    data_dir = Path(os.environ.get("MOMAI_DATA_DIR", "."))
    return data_dir / "data" / "node-core-store.json"

@router.get("")
def get_settings():
    p = _store_path()
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8")).get("settings", {})

@router.patch("")
def patch_settings(patch: dict):
    p = _store_path()
    if not p.exists():
        raise HTTPException(404, "store not found")
    store = json.loads(p.read_text(encoding="utf-8"))
    store.setdefault("settings", {}).update(patch)
    p.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")
    return store["settings"]
```

- [ ] **Step 2: Registrar router em `main.py`**

- [ ] **Step 3: Modificar `coreManager.ts` para usar `/settings/json` em vez de `momai.db`**

- [ ] **Step 4: Teste E2E**

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor(settings): single source of truth in node-core-store.json (U001)"
```

---

## Task 3.2: Criptografar notes com AES-256-GCM

**Files:**
- Create: `apps/momai/src/main/security/note-crypto.ts`
- Modify: `apps/momai/src/main/notesService.ts:45-49,116,121,275,323`
- Modify: `apps/momai/scripts/node-core/domain/note-manager.js:13-46` (ler/escrever cifrado)

- [ ] **Step 1: Implementar crypto de notes**

```ts
// apps/momai/src/main/security/note-crypto.ts
import { safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const SALT = Buffer.from('momai-notes-salt-v1', 'utf-8')  // fixed for deterministic KDF

function getKey(): Buffer | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  // Use a fixed marker string; safeStorage encrypts/decrypts it for us
  // The actual AES key is derived from a per-install secret stored in safeStorage
  // (we use safeStorage as a "keychain" for the key derivation passphrase)
  const marker = safeStorage.encryptString('momai-notes-key-v1')
  return scryptSync(marker, SALT, 32)
}

export function encryptNote(plain: string): string | null {
  const key = getKey()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptNote(encBase64: string): string | null {
  const key = getKey()
  if (!key) return null
  const buf = Buffer.from(encBase64, 'base64')
  const [iv, tag, enc] = [buf.subarray(0, 12), buf.subarray(12, 28), buf.subarray(28)]
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf-8')
}
```

- [ ] **Step 2: Teste de roundtrip**

```ts
describe('note-crypto', () => {
  it('roundtrips plain text through encrypt/decrypt', () => {
    const plain = 'minha nota secreta: senha = 12345'
    const enc = encryptNote(plain)
    expect(enc).not.toBeNull()
    expect(enc).not.toContain('senha')  // ciphertext doesn't leak
    expect(decryptNote(enc!)).toBe(plain)
  })
})
```

- [ ] **Step 3: Modificar `notesService.ts` para gravar `.md.enc` em vez de `.md`**

- [ ] **Step 4: Migration no startup: cifrar `.md` existentes → `.md.enc`**

- [ ] **Step 5: Modificar `note-manager.js` para chamar `decryptNote` antes de servir conteúdo**

- [ ] **Step 6: Smoke test + commit**

```bash
git commit -am "feat(notes): encrypt notes with AES-256-GCM derived from safeStorage (U002)"
```

---

## Task 3.3: Wrapper `secureWriteFile` (permissões 0600)

**Files:**
- Create: `apps/momai/src/main/security/fs-permissions.ts`

- [ ] **Step 1: Implementar wrapper**

```ts
import { writeFileSync, chmodSync, writeFile } from 'node:fs'
import { promisify } from 'node:util'

const writeFileAsync = promisify(writeFile)

export function secureWriteFileSync(path: string, data: string | Buffer): void {
  writeFileSync(path, data)
  try {
    chmodSync(path, 0o600)
  } catch {
    // Windows doesn't honor Unix perms; rely on ACLs
  }
}

export async function secureWriteFile(path: string, data: string | Buffer): Promise<void> {
  await writeFileAsync(path, data)
  try {
    chmodSync(path, 0o600)
  } catch {}
}
```

- [ ] **Step 2: Teste**

```ts
import { describe, it, expect } from 'vitest'
import { secureWriteFileSync } from './fs-permissions'
import { readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('secureWriteFileSync', () => {
  it('writes file and sets 0600 on Unix', () => {
    if (process.platform === 'win32') return  // skip
    const p = join(tmpdir(), `test-${Date.now()}`)
    secureWriteFileSync(p, 'secret')
    const mode = statSync(p).mode & 0o777
    expect(mode).toBe(0o600)
  })
})
```

- [ ] **Step 3: Substituir `fs.writeFileSync` por `secureWriteFileSync` em:
- `apps/momai/scripts/skills/packaged/whatsapp/background-worker.js`
- `apps/momai/src/main/notesService.ts`
- `apps/momai/src/main/coreManager.ts:126` (economy preferences)

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(fs): secureWriteFile wrapper with 0600 permissions (U003)"
```

---

## Task 3.4: Migrar `node-core-store.json` → SQLite (opcional, fase 3.5)

> **Esta task é grande e pode ser dividida em subtasks. Considerar faze-la como plano separado se necessário.**

**Subtasks:**
- 3.4.1: Adicionar `better-sqlite3` ao `apps/momai/package.json`
- 3.4.2: Criar schema SQLite equivalente ao JSON store
- 3.4.3: Dual-write (escreve nos dois, lê do JSON — fase de transição)
- 3.4.4: Migration one-shot: ler JSON store, popular SQLite, marcar JSON como `.bak`
- 3.4.5: Cutover: ler do SQLite, parar de escrever no JSON
- 3.4.6: Remover JSON store após 2 versões

> **Detalhamento completo deste escopo merece plano próprio.** Para a Fase 3, focar nas tasks 3.1-3.3.

---

## Task 3.5: Endpoints "Export my data" e "Delete all my data" (LGPD)

**Files:**
- Create: `apps/momai/scripts/node-core/api/routes/privacy.js`
- Modify: `apps/momai/src/main/index.ts` (registrar)

- [ ] **Step 1: Implementar `GET /privacy/export` que retorna ZIP com todos os dados do usuário**

```js
// Estrutura do ZIP:
// export-2026-06-23.zip
//   ├── settings.json
//   ├── reminders.json
//   ├── messages/
//   │   └── <thread_id>.json
//   ├── notes/
//   │   ├── <note_id>.md
//   │   └── index.json
//   ├── extensions/
//   ├── metrics.json
//   └── README.md  (instruções de uso)
```

- [ ] **Step 2: Implementar `POST /privacy/delete-all` que remove tudo (com confirmação)**

```js
// Remove:
// - data/node-core-store.json
// - data/messages.json (se ainda existir)
// - data/notes/ (com migration .enc → .md)
// - data/extensions/<id>/<key>.json (storage por extension)
// - data/extensions/whatsapp/ (se instalado)
// - data/extensions/<outros>/
// - data/semantic/lancedb/
// - data/observability-metrics.json
// - data/models/*.gguf (opcional, ask)
// - python_env/, uv_cache/, uv_python/
// NÃO remove: log files (debug), installer-side data
```

- [ ] **Step 3: Testes E2E**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(privacy): export and delete-all endpoints (LGPD) (U004)"
```

---

# FASE 4 — UX & Compliance (ongoing)

---

## Task 4.1: Botão "Reset all my data" no Settings UI

**Files:**
- Modify: `apps/momai/src/renderer/src/views/SettingsView.tsx` (ou equivalente — Settings panel)

- [ ] **Step 1: Adicionar botão com diálogo de confirmação**

```tsx
<Button variant="destructive" onClick={onResetAllData}>
  Reset all my data
</Button>
<ConfirmDialog
  title="Reset all data?"
  description="This will permanently delete your notes, history, sessions, and downloaded models. Your account with the MomAI service (if any) will not be affected."
  confirmText="Yes, delete everything"
  onConfirm={async () => {
    await window.momai.privacy.deleteAll()
    window.location.reload()
  }}
/>
```

- [ ] **Step 2: Smoke test manual + commit**

---

## Task 4.2: Tela "Privacy & Data" transparente

**Files:**
- Create: `apps/momai/src/renderer/src/views/PrivacyView.tsx`

- [ ] **Step 1: Criar view que explica:
- O que é armazenado localmente
- O que NÃO é armazenado (servidores externos)
- Botão "Export my data" (link para `/privacy/export`)
- Botão "Reset all my data"
- Link para política de privacidade

- [ ] **Step 2: Adicionar rota no router + sidebar**

- [ ] **Step 3: Commit**

---

## Task 4.3: Atualizar política de privacidade

**Files:**
- Modify: `politicas-privacidade-momai.html` ou `politicas-privacidade.html`

- [ ] **Step 1: Adicionar seção "Data retention"

- [ ] **Step 2: Documentar criptografia at-rest (Notes + Baileys)

- [ ] **Step 3: Documentar cleanup no uninstall

- [ ] **Step 4: Documentar endpoints de export/delete

---

## Task 4.4: CI check anti-commit de `.env*`

**Files:**
- Create: `.github/workflows/ci.yml` (ou modificar existente) — adicionar step

```yaml
- name: Block .env files from being committed
  run: |
    if git diff --cached --name-only | grep -E "^\.env|\.env\." | grep -v "\.env\.example$"; then
      echo "ERROR: .env files cannot be committed"
      exit 1
    fi
```

- [ ] **Step 1: Adicionar step no CI**

- [ ] **Step 2: Testar fazendo commit de `.env` em branch temporária**

- [ ] **Step 3: Commit**

---

# Resumo de Entregas por Fase

| Fase | Entregas | Esforço | Bloqueia |
|------|----------|---------|----------|
| **1 (Críticos)** | NSIS variants + auto-start, safeStorage IPC, Baileys crypto, HF_HOME redirect, .gitignore | 1-2 dias | Nada |
| **2 (Redução)** | Remover messages.json, TTL threads, auto-purge reminders, observability → cache/, log sanitization | 3-5 dias | Nada (pode paralelizar com Fase 1) |
| **3 (Unificação + crypto)** | Settings source-of-truth, notes AES-256-GCM, secureWriteFile, export/delete LGPD | 1-2 semanas | Fase 1.3 (safeStorage IPC) |
| **4 (UX + compliance)** | Botão reset, tela privacy, política, CI check | ongoing | Fase 3.5 (export/delete) |

---

# Critérios de Pronto por Fase

## Fase 1
- [ ] `pnpm typecheck && pnpm lint && pnpm test` passam
- [ ] `cd apps/core && uv run pytest` passa
- [ ] Build de instalador NSIS funciona
- [ ] Smoke test: install → uninstall → verificar que `~/.cache/huggingface/` e `MomAI-Store/` são removidos

## Fase 2
- [ ] Testes de retenção passam
- [ ] Smoke test: chat longo → fechar app → reopen → threads > 90 dias somem
- [ ] Logs não contêm `user_name=`, `api_key=`, etc

## Fase 3
- [ ] Settings funcionam idênticos antes/depois (regressão visual)
- [ ] Notes cifradas → abrir no app → conteúdo legível
- [ ] ZIP export contém todas as categorias de dados
- [ ] `delete-all` remove userData inteiro

## Fase 4
- [ ] Tela Privacy acessível e funcional
- [ ] Política de privacidade atualizada
- [ ] CI bloqueia `.env`

---

# Notas de Arquitetura

## Por que SQLite no Node side em vez de reutilizar `momai.db` da Core?

A `momai.db` da Core é gerenciada por SQLAlchemy com migrations manuais. Adicionar tabelas do Node exigiria:
- Coordenar schema entre dois runtimes
- Race conditions (Core lê, Node escreve)
- Migração de dados cross-language

Manter SQLite separado no Node (com `better-sqlite3` síncrono, lock-free via WAL) é mais simples e dá **ACID** sem dor.

## Por que cifrar notes em vez de cifrar o DB inteiro?

- Cifrar DB inteiro: requer sqlcipher (binding C++), complica debugging
- Cifrar por arquivo: granular (pode apagar uma nota sem descriptografar tudo), transparente para SQLite/LanceDB

## Por que `safeStorage` em vez de keytar?

- `keytar` é nativo (ABI quebrado em upgrades Electron)
- `safeStorage` é API estável do Electron, usa keychain do OS (Keychain/DPAPI/libsecret)
- Já temos o wrapper `keychain.ts` pronto
