const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const { createSkillLlmHelper } = require('../../services/skill-llm')

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
    semanticState
  } = context

  return async function handleExtensionsRoutes(req, res, pathname, parsedUrl) {
    if (pathname === '/extensions' && req.method === 'GET') {
      skillRegistry.refresh()
      sendJson(res, 200, buildExtensionsPayload())
      return true
    }

    if (pathname === '/extensions/registry' && req.method === 'GET') {
      skillRegistry.refresh()
      sendJson(res, 200, buildExtensionsPayload())
      return true
    }

    if (pathname === '/extensions/install' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      const requested = String(payload.id || crypto.randomUUID()).toLowerCase()
      const id =
        requested.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID()
      const extDir = path.join(skillRegistry.extensionsDir, id)
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
      skillRegistry.loadExtensions()
      sendJson(res, 200, { ok: true })
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
      skillRegistry.loadExtensions()
      sendJson(res, 200, { ok: true })
      return true
    }

    if (pathname === '/extensions/uninstall' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => ({}))
      store.extensions = store.extensions.filter((item) => item.id !== payload.id)
      const extDir = path.join(skillRegistry.extensionsDir, String(payload.id || ''))
      if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true, force: true })
      saveStore()
      skillRegistry.loadExtensions()
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

      /* Try to find the skill and execute */
      const skill = skillRegistry.getById(extId)
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

      const cmd = process.platform === 'win32'
        ? `start "" "${targetPath}"`
        : `open "${targetPath}"`

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

    return false
  }
}

module.exports = { createExtensionsRoutes }
