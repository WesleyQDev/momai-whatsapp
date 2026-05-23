const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const http = require('node:http')
const https = require('node:https')
const { exec } = require('node:child_process')
const { createSkillLlmHelper } = require('../../services/skill-llm')
const { createPermissionSchema } = require('../../permissions/schema')
const extensionEvents = require('../../services/extension-events')

let _cachedExtensionsPayload = null
let _lastExtensionsRefresh = 0

/* ── Helpers for downloading & extracting community extensions ── */

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    const request = client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {}
        return downloadFile(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject)
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {}
        return reject(new Error(`HTTP ${response.statusCode}`))
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
      let receivedBytes = 0
      let lastTime = Date.now()
      let lastBytes = 0

      response.on('data', (chunk) => {
        receivedBytes += chunk.length
        const now = Date.now()
        if (now - lastTime >= 500) {
          const speedBps = ((receivedBytes - lastBytes) / (now - lastTime)) * 1000
          const speedStr =
            speedBps > 1048576
              ? (speedBps / 1048576).toFixed(1) + ' MB/s'
              : (speedBps / 1024).toFixed(1) + ' KB/s'
          const percent = totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : 0
          if (onProgress) onProgress(percent, speedStr)
          lastTime = now
          lastBytes = receivedBytes
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    })
    request.on('error', (err) => {
      file.close()
      try {
        fs.unlinkSync(destPath)
      } catch {}
      reject(err)
    })
    request.setTimeout(30000, () => {
      request.destroy()
      file.close()
      try {
        fs.unlinkSync(destPath)
      } catch {}
      reject(new Error('Download timeout'))
    })
  })
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      exec(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
        { timeout: 30000 },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    } else {
      exec(`unzip -o "${zipPath}" -d "${destDir}"`, { timeout: 30000 }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    }
  })
}

function flattenExtractedDir(extractDir) {
  const items = fs.readdirSync(extractDir)
  if (items.length === 1) {
    const subDir = path.join(extractDir, items[0])
    try {
      if (fs.statSync(subDir).isDirectory()) {
        const files = fs.readdirSync(subDir)
        for (const file of files) {
          const src = path.join(subDir, file)
          const dst = path.join(extractDir, file)
          fs.renameSync(src, dst)
        }
        fs.rmdirSync(subDir)
      }
    } catch {}
  }
}

function createExtensionsRoutes(context) {
  const {
    skillRegistry,
    buildExtensionsPayload,
    sendJson,
    readJsonBody,
    store,
    saveStore,
    ensureDir,
    llamaState,
    semanticState,
    extensionHostManager = { sendToPersistent: async () => ({ ok: false, error: 'not_available' }) }
  } = context

  async function getExtensionsPayload(lang) {
    const now = Date.now()
    if (now - _lastExtensionsRefresh < 10000) {
      const cached = _cachedExtensionsPayload
      if (cached) return cached
    }
    await skillRegistry.refresh()
    const payload = await buildExtensionsPayload(lang)
    _cachedExtensionsPayload = payload
    _lastExtensionsRefresh = now
    return payload
  }

  return async function handleExtensionsRoutes(req, res, pathname, parsedUrl) {
    const lang = parsedUrl.searchParams?.get('lang') || 'pt-BR'

    if (pathname === '/extensions' && req.method === 'GET') {
      console.log(`[ExtensionsAPI] GET /extensions (lang: ${lang})`)
      const payload = await getExtensionsPayload(lang)
      sendJson(res, 200, payload)
      return true
    }

    if (pathname === '/extensions/registry' && req.method === 'GET') {
      const payload = await getExtensionsPayload(lang)
      sendJson(res, 200, payload)
      return true
    }

    if (pathname === '/extensions/install' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      const requested = String(payload.id || crypto.randomUUID()).toLowerCase()
      const id =
        requested.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID()
      const extDir = path.join(skillRegistry.extensionsDir, id)

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked'
      })

      const sendStatus = (status, percent, speed) => {
        res.write(JSON.stringify({ status, percent, speed }) + '\n')
      }

      const downloadUrl = String(payload.download_url || '').trim()
      if (downloadUrl) {
        ensureDir(extDir)
        console.log(`[ExtensionsAPI] Downloading extension ${id} from ${downloadUrl}...`)
        const zipPath = path.join(extDir, 'archive.zip')
        try {
          sendStatus('Baixando...', 0, '0 KB/s')
          await downloadFile(downloadUrl, zipPath, (percent, speed) =>
            sendStatus('Baixando...', percent, speed)
          )
          console.log(`[ExtensionsAPI] Extracting ${id}...`)
          sendStatus('Extraindo...', 100, '-')
          await extractZip(zipPath, extDir)
          try {
            fs.unlinkSync(zipPath)
          } catch {}
          flattenExtractedDir(extDir)
        } catch (err) {
          try {
            fs.rmSync(extDir, { recursive: true, force: true })
          } catch {}
          res.write(
            JSON.stringify({ ok: false, error: `Failed to download/extract: ${err.message}` }) +
              '\n'
          )
          res.end()
          return true
        }
      } else {
        ensureDir(extDir)
        const skillMdPath = path.join(extDir, 'SKILL.md')
        if (!fs.existsSync(skillMdPath)) {
          const description = String(payload.description || 'Extension skill for MomAI.')
          fs.writeFileSync(
            skillMdPath,
            [
              '---',
              `name: ${id}`,
              `description: ${description}`,
              'compatibility: MomAI Node Core',
              '---',
              '',
              '# Extension Skill',
              '',
              'Descreva aqui quando usar esta skill e como executar o fluxo.',
              '',
              '## Quando usar',
              '-',
              '',
              '## Como executar',
              '1.'
            ].join('\n'),
            'utf8'
          )
        }
      }

      if (!store.extensions.find((ext) => ext.id === id)) {
        store.extensions.push({
          id,
          name: id,
          description: 'Extension installed by Node core',
          category: 'builtin',
          enabled: true
        })
        saveStore()
      }
      await skillRegistry.loadExtensions()

      // Seed keywords from SKILL.md intents
      const installedSkill = skillRegistry.getById(id)
      if (installedSkill && installedSkill.manifest?.intents?.length) {
        if (!store.skillKeywords) store.skillKeywords = {}
        if (!store.skillKeywords[id] || store.skillKeywords[id].length === 0) {
          store.skillKeywords[id] = installedSkill.manifest.intents
          saveStore()
        }
      }

      await skillRegistry.executeHook(id, 'onInstall', { extId: id, extDir }).catch((err) => {
        console.log(`[extensions] onInstall hook failed for ${id}: ${err.message}`)
      })

      _cachedExtensionsPayload = null
      _lastExtensionsRefresh = 0
      if (context.syncSkillAndToolIndexes) {
        context.syncSkillAndToolIndexes(true).catch(() => {})
      }

      sendStatus('Concluído', 100, '-')
      res.write(JSON.stringify({ ok: true }) + '\n')
      res.end()
      return true
    }

    if (pathname === '/extensions/toggle' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      let found = store.extensions.find((item) => item.id === payload.id)
      if (!found) {
        // Allow toggling builtins/packaged by creating a store entry
        found = {
          id: payload.id,
          name: payload.id,
          description: '',
          category: 'builtin',
          enabled: true
        }
        store.extensions.push(found)
      }
      found.enabled = Boolean(payload.enabled)
      saveStore()
      await skillRegistry.loadExtensions()

      _cachedExtensionsPayload = null
      _lastExtensionsRefresh = 0
      if (context.syncSkillAndToolIndexes) {
        context.syncSkillAndToolIndexes(true).catch(() => {})
      }

      // Manage persistent worker lifecycle if needed
      const skill = skillRegistry.getById(payload.id)
      if (skill && skill.manifest?.background) {
        if (found.enabled) {
          console.log(`[extensions] Starting persistent worker for toggled extension: ${skill.id}`)
          extensionHostManager
            .startPersistent(skill.id, skill.dir, skill.manifest)
            .catch((err) =>
              console.log(
                `[extensions] Failed to start persistent worker for ${skill.id}:`,
                err.message
              )
            )
        } else {
          console.log(`[extensions] Stopping persistent worker for toggled extension: ${skill.id}`)
          await extensionHostManager.stopPersistent(skill.id).catch((err) => {
            console.log(
              `[extensions] Failed to stop persistent worker for ${skill.id}:`,
              err.message
            )
          })
        }
      }

      const hookName = found.enabled ? 'onActivate' : 'onDeactivate'
      await skillRegistry.executeHook(payload.id, hookName, { extId: payload.id }).catch((err) => {
        console.log(`[extensions] ${hookName} hook failed for ${payload.id}: ${err.message}`)
      })
      sendJson(res, 200, { ok: true })
      return true
    }

    if (pathname === '/extensions/uninstall' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      const extId = String(payload.id || '')
      const extDir = path.join(skillRegistry.extensionsDir, extId)

      // Stop persistent worker if running
      await extensionHostManager.stopPersistent(extId).catch((err) => {
        console.log(
          `[extensions] Failed to stop persistent worker during uninstall for ${extId}:`,
          err.message
        )
      })

      await skillRegistry.executeHook(extId, 'onUninstall', { extId, extDir }).catch((err) => {
        console.log(`[extensions] onUninstall hook failed for ${extId}: ${err.message}`)
      })
      // Clean up keywords
      if (store.skillKeywords) {
        delete store.skillKeywords[extId]
      }
      store.extensions = store.extensions.filter((item) => item.id !== extId)
      if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true, force: true })
      saveStore()
      await skillRegistry.loadExtensions()

      _cachedExtensionsPayload = null
      _lastExtensionsRefresh = 0
      if (context.syncSkillAndToolIndexes) {
        context.syncSkillAndToolIndexes(true).catch(() => {})
      }

      sendJson(res, 200, { ok: true })
      return true
    }

    /* ── Generic Extension Action Endpoint ── */
    if (
      pathname.startsWith('/extensions/') &&
      pathname.endsWith('/action') &&
      req.method === 'POST'
    ) {
      const parts = pathname.split('/').filter(Boolean)
      const extId = parts[1]
      const body = await readJsonBody(req).catch(() => ({}))
      const actionName = String(body.action || 'default')
      const actionPayload = body.payload || {}

      /* Permission enforcement before execution */
      const skill = skillRegistry.getById(extId)
      const permSchema = createPermissionSchema()
      const perms = skill?.manifest?.permissions
      if (skill && perms && permSchema.needsAnyPermission(perms)) {
        if (perms.process?.allowed === false) {
          sendJson(res, 403, {
            ok: false,
            error: 'permission_denied',
            reason: 'process access denied'
          })
          return true
        }
        if (perms.shell?.allowed === false) {
          sendJson(res, 403, {
            ok: false,
            error: 'permission_denied',
            reason: 'shell access denied'
          })
          return true
        }
      }

      /* Try to find the skill and execute */
      if (skill && typeof skill.execute === 'function') {
        try {
          const llm = createSkillLlmHelper({
            llamaState,
            tierName: store?.settings?.ai_tier || 'ultra',
            temperature: 0.35
          })
          const result = await skill.execute({
            content: actionName,
            context: { llm },
            manifest: skill.manifest,
            args: actionPayload,
            toolName: actionName
          })
          sendJson(res, 200, result || { ok: true })
          return true
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message })
          return true
        }
      }

      /* Fallback: return ok for extensions without runtime */
      sendJson(res, 200, { ok: true, result: null })
      return true
    }

    /* ── Launcher Open Endpoint (keep for backward compat) ── */
    if (pathname === '/launcher/open' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      const targetPath = String(payload.path || '').trim()

      if (!targetPath) {
        sendJson(res, 400, { ok: false, error: 'Caminho nao fornecido' })
        return true
      }

      if (!fs.existsSync(targetPath)) {
        sendJson(res, 400, { ok: false, error: 'Caminho nao encontrado no disco' })
        return true
      }

      const cmd = process.platform === 'win32' ? `start "" "${targetPath}"` : `open "${targetPath}"`

      const { exec } = require('node:child_process')
      exec(cmd, (err) => {
        if (err) {
          sendJson(res, 500, { ok: false, error: err.message })
        } else {
          sendJson(res, 200, { ok: true, path: targetPath })
        }
      })
      return true
    }

    if (pathname === '/extensions/hardware-stats' && req.method === 'GET') {
      const mem = process.memoryUsage()
      sendJson(res, 200, {
        cpu_usage: 0,
        ram_usage: Math.round((mem.rss / os.totalmem()) * 100),
        active_processes: (llamaState.process ? 2 : 1) + (semanticState.embedding.process ? 1 : 0),
        vram_usage: 0
      })
      return true
    }

    /* ── SSE stream for extension push events ── */
    if (pathname === '/extensions/events' && req.method === 'GET') {
      extensionEvents.addClient(res)
      return true
    }

    /* ── Fetch panel data from persistent worker ── */
    const panelMatch = pathname.match(/^\/extensions\/([^/]+)\/panel$/)
    if (panelMatch && req.method === 'GET') {
      const extId = panelMatch[1]
      try {
        const result = await extensionHostManager.sendToPersistent(extId, {
          toolName: 'panel',
          args: {}
        })
        const body = result || { ok: false, error: 'no_data' }
        // Wrap raw responses in structured response for GenericExtensionCard
        if (!body.structuredResponse) {
          body.structuredResponse = {
            type: 'generic-extension',
            data: {
              extension: extId,
              header: { title: extId, subtitle: body.connected ? 'Conectado' : 'Desconectado' },
              connected: body.connected,
              status: body.error
                ? { type: 'error', message: body.error }
                : body.connected
                  ? { type: 'success', message: 'Conectado' }
                  : undefined,
              items: (body.whitelist || []).map(function (w) {
                return { label: w.name || w, meta: w.number || w }
              })
            }
          }
        }
        sendJson(res, 200, body)
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.message })
      }
      return true
    }

    /* ── Helper: wipe Baileys auth dir (rm dir, fallback to creds.json) ── */
    function _wipeBaileysAuth() {
      // Worker resolves data dir from __dirname — we mirror that here
      // routes file: .../node-core/api/routes/ -> ../../../../data = .../momai/data
      // worker file: .../packaged/whatsapp/ -> ../../../../data = .../momai/data
      const repoData = path.resolve(__dirname, '..', '..', '..', '..', 'data')
      const authDir = path.join(repoData, 'extensions', 'whatsapp', 'baileys-auth')
      try {
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true })
          console.log('[extensions] Deleted baileys-auth/')
          return
        }
      } catch (e) {
        console.log('[extensions] Full rm failed, trying creds.json fallback:', e.message)
      }
      // Fallback: delete just creds.json
      try {
        const credsPath = path.join(authDir, 'creds.json')
        if (fs.existsSync(credsPath)) {
          fs.unlinkSync(credsPath)
          console.log('[extensions] Deleted creds.json (fallback)')
        }
      } catch (e) {
        console.log('[extensions] Failed to delete creds.json:', e.message)
      }
    }

    /* ── Disconnect WhatsApp: stop + wipe auth + restart to show QR ── */
    if (pathname === '/extensions/whatsapp/disconnect' && req.method === 'POST') {
      try {
        // 1. Kill persistent worker and WAIT for process to fully exit
        await extensionHostManager.stopPersistent('whatsapp')
        await new Promise((r) => setTimeout(r, 500))

        // 2. Wipe Baileys auth — forces QR on next start
        _wipeBaileysAuth()

        // 3. Broadcast logged_out so UI shows QR container
        extensionEvents.broadcast('authenticated', { status: 'logged_out' })

        // 4. Restart worker fresh
        const whatsappSkill = (skillRegistry.getAll?.() || []).find((s) => s.id === 'whatsapp')
        if (whatsappSkill) {
          setTimeout(() => {
            extensionHostManager
              .startPersistent(whatsappSkill.id, whatsappSkill.dir, whatsappSkill.manifest)
              .then(() => console.log('[extensions] WhatsApp re-started after disconnect'))
              .catch((err) => console.log('[extensions] WhatsApp restart failed:', err.message))
          }, 500)
        }

        sendJson(res, 200, { ok: true, connected: false })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.message })
      }
      return true
    }

    /* ── Restart WhatsApp worker (same as disconnect: kill + wipe auth + restart) ── */
    if (pathname === '/extensions/whatsapp/restart' && req.method === 'POST') {
      try {
        console.log('[extensions] Restart requested')
        await extensionHostManager.stopPersistent('whatsapp').catch(() => {})
        await new Promise((r) => setTimeout(r, 500))

        _wipeBaileysAuth()

        const skill = (skillRegistry.getAll?.() || []).find((s) => s.id === 'whatsapp')
        if (skill) {
          extensionHostManager
            .startPersistent(skill.id, skill.dir, skill.manifest)
            .then(() => console.log('[extensions] WhatsApp restarted'))
            .catch((err) => console.log('[extensions] Restart failed:', err.message))
        }

        extensionEvents.broadcast('authenticated', { status: 'logged_out' })
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.message })
      }
      return true
    }

    /* ── Sync WhatsApp contacts (restart worker WITHOUT wiping auth) ── */
    if (pathname === '/extensions/whatsapp/sync' && req.method === 'POST') {
      try {
        console.log('[extensions] Sync contacts requested')
        await extensionHostManager.stopPersistent('whatsapp').catch(() => {})
        await new Promise((r) => setTimeout(r, 500))

        const skill = (skillRegistry.getAll?.() || []).find((s) => s.id === 'whatsapp')
        if (skill) {
          extensionHostManager
            .startPersistent(skill.id, skill.dir, skill.manifest)
            .then(() => console.log('[extensions] WhatsApp synced (worker restarted with auth)'))
            .catch((err) => console.log('[extensions] Sync restart failed:', err.message))
        }

        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.message })
      }
      return true
    }

    /* ── Process WhatsApp notification with LLM ── */
    if (pathname === '/extensions/whatsapp/process-notification' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}))
      const contact = body.contact || body.from || 'Alguem'
      const message = body.message || body.text || ''
      const isGroup = body.isGroup || false
      const groupName = body.groupName || ''
      const isNumber = /^\d{8,}$/.test(contact.replace(/\D/g, ''))
      const displayContact = isNumber ? 'Um contato' : contact

      // Default: TTS informativo caso o LLM falhe
      let tts = isGroup
        ? `${displayContact} enviou uma mensagem no grupo ${groupName} no WhatsApp`
        : `${displayContact} te enviou uma mensagem no WhatsApp`
      let quickReplies = ['Sim', 'Nao', 'Agora nao']

      try {
        const { createSkillLlmHelper } = require('../../services/skill-llm')
        const llm = createSkillLlmHelper({
          llamaState,
          tierName: store?.settings?.ai_tier || 'pro',
          temperature: 0.5
        })
        const result = await llm.completeText({
          system:
            'Voce e um assistente notificando o usuario sobre uma mensagem recebida no WhatsApp. Fale em segunda pessoa para o usuario. Explique quem enviou e o contexto, incluindo o nome do grupo se a mensagem for de um grupo. Nao repita a mensagem literalmente. Separe a frase TTS das sugestoes de resposta com " | ". As sugestoes devem ser mensagens CURTAS que o usuario enviaria no WhatsApp (ate 6 palavras), nunca descricoes de acao. Errado: "Respondi de volta com uma mensagem curta" ou "Ignorei e nao falei nada". Certo: "Oi, tudo bem!" | "To ocupado" | "Depois falo". Exemplo completo: sua mae perguntou se voce almocou pelo whatsapp | Ja almocamos | Ainda nao',
          user: isGroup
            ? `Quem enviou: ${displayContact} no grupo "${groupName}". Mensagem: "${message}"`
            : `Quem enviou: ${displayContact}. Mensagem: "${message}"`
        })
        const text = (result.text || '').trim()
        const parts = text
          .split('|')
          .map(function (s) {
            return s.trim()
          })
          .filter(Boolean)
        if (parts.length >= 2) {
          tts = parts[0]
          const opts = parts.slice(1).flatMap(function (s) {
            return s
              .split(/[,;]/)
              .map(function (x) {
                return x.trim()
              })
              .filter(Boolean)
          })
          if (opts.length >= 1) quickReplies = opts.slice(0, 3)
        }
      } catch {}

      sendJson(res, 200, { tts, quickReplies })
      return true
    }

    /* ── Generic LLM completion for extensions ── */
    if (pathname === '/extensions/llm/complete' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}))
      const prompt = String(body.prompt || body.user || '')
      if (!prompt) {
        sendJson(res, 200, { text: '' })
        return true
      }
      try {
        const { createSkillLlmHelper } = require('../../services/skill-llm')
        const llm = createSkillLlmHelper({
          llamaState,
          tierName: store?.settings?.ai_tier || 'pro',
          temperature: 0.4
        })
        const result = await llm.completeText({
          system: String(
            body.system ||
              'Responda de forma direta e natural. Gere APENAS o texto da resposta, sem explicacoes, sem aspas, sem formatacao.'
          ),
          user: prompt
        })
        const text = (result.text || '').trim()
        sendJson(res, 200, { text })
      } catch {
        sendJson(res, 200, { text: '' })
      }
      return true
    }

    /* ── Send command to persistent worker ── */
    const cmdMatch = pathname.match(/^\/extensions\/([^/]+)\/command$/)
    if (cmdMatch && req.method === 'POST') {
      const extId = cmdMatch[1]
      const body = await readJsonBody(req).catch(() => ({}))
      try {
        const result = await extensionHostManager.sendToPersistent(extId, {
          toolName: body.toolName,
          args: body.args || {}
        })
        sendJson(res, 200, result || { ok: true })
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.message })
      }
      return true
    }

    return false
  }
}

module.exports = { createExtensionsRoutes }
