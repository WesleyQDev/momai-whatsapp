const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')

function createExtensionsRoutes(context) {
  const {
    skillRegistry,
    buildExtensionsPayload,
    sendJson,
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
      const payload = await context.readJsonBody(req).catch(() => ({}))
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
      const payload = await context.readJsonBody(req).catch(() => ({}))
      const found = store.extensions.find((item) => item.id === payload.id)
      if (found) found.enabled = Boolean(payload.enabled)
      saveStore()
      skillRegistry.loadExtensions()
      sendJson(res, 200, { ok: true })
      return true
    }

    if (pathname === '/extensions/uninstall' && req.method === 'POST') {
      const payload = await context.readJsonBody(req).catch(() => ({}))
      store.extensions = store.extensions.filter((item) => item.id !== payload.id)
      const extDir = path.join(skillRegistry.extensionsDir, String(payload.id || ''))
      if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true, force: true })
      saveStore()
      skillRegistry.loadExtensions()
      sendJson(res, 200, { ok: true })
      return true
    }

    if (
      pathname.startsWith('/extensions/') &&
      pathname.endsWith('/action') &&
      req.method === 'POST'
    ) {
      sendJson(res, 200, { ok: true, result: null })
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
