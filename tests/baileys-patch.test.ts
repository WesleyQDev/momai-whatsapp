import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const BAILEYS_VERSION = '6.7.24'
const BAILEYS_PATCH = `patches/@whiskeysockets__baileys@${BAILEYS_VERSION}.patch`

describe('Baileys dependency pin and patch', () => {
  it('pins the exact baileys version with the group-send patch applied', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@whiskeysockets/baileys']).toBe(BAILEYS_VERSION)
    expect(pkg.pnpm?.patchedDependencies?.[`@whiskeysockets/baileys@${BAILEYS_VERSION}`]).toBe(
      BAILEYS_PATCH
    )
  })

  it('keeps the lockfile specifier and patch hash in sync with the pin', () => {
    const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8')
    expect(lock).toContain(`specifier: ${BAILEYS_VERSION}`)
    expect(lock).toContain(`@whiskeysockets/baileys@${BAILEYS_VERSION}`)
    expect(lock).toContain('patch_hash=')
  })

  it('keeps the per-JID assertSessions patch for group sends', () => {
    const patch = fs.readFileSync(path.join(root, BAILEYS_PATCH), 'utf8')
    expect(patch).toContain('messages-send.js')
    expect(patch).toContain('assertSessions')
  })

  it('keeps LID device servers in the direct-send path', () => {
    const patch = fs.readFileSync(path.join(root, BAILEYS_PATCH), 'utf8')
    const patchedLoops = patch.match(
      /for \(const \{ user, device, server: devServer \} of devices\)/g
    )
    expect(patchedLoops?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(patch).toContain("devServer || (isLid ? 'lid' : 's.whatsapp.net')")
    expect(patch).toContain('const meLidUser = authState.creds?.me?.lid?.split')
    expect(patch).toContain('user === meUser || (!!meLidUser && user === meLidUser)')
    expect(patch).toContain("devServer === 'lid' ? meLidUser || user")
  })

  it('uses the Baileys fix for spoofed self-only protocol messages', () => {
    const processMessage = fs.readFileSync(
      path.join(root, 'node_modules/@whiskeysockets/baileys/lib/Utils/process-message.js'),
      'utf8'
    )
    expect(processMessage).toContain('SELF_ONLY_TYPES')
    expect(processMessage).toContain('dropping spoofed self-only protocolMessage from non-self origin')
  })
})
