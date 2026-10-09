import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import manifest from '../manifest.json'

const root = process.cwd()
const automationDoc = fs.readFileSync(path.join(root, 'AUTOMATION.md'), 'utf8')
const worker = fs.readFileSync(path.join(root, 'background-worker.ts'), 'utf8')

describe('automation contract (item 9)', () => {
  it('documents the trigger id that the extension actually emits', () => {
    expect((manifest as any).eventTypes).toHaveProperty('whatsapp_message')
    expect(worker).toContain("sendEvent('whatsapp_message'")
    expect(automationDoc).toContain('momai-whatsapp.whatsapp_message')
    expect(automationDoc).not.toContain('whatsapp.message_received')
  })

  it('documents the payload fields present in the emitted event', () => {
    for (const field of ['contact', 'senderName', 'contactJid', 'message', 'isGroup', 'timestamp']) {
      expect(automationDoc).toContain(field)
    }
  })

  it('documents the canonical action id for an existing tool', () => {
    expect(automationDoc).toContain('momai-whatsapp.send_message')
    expect(((manifest as any).tools as any[]).some((tool) => tool.name === 'send_message')).toBe(
      true
    )
  })
})
