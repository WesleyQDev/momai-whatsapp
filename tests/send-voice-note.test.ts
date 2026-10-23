import { describe, it, expect } from 'vitest'
import manifest from '../manifest.json'

describe('send_voice_note tool contract', () => {
  it('declares send_voice_note in manifest tools', () => {
    const tool = (manifest.tools as any[]).find((t) => t.name === 'send_voice_note')
    expect(tool).toBeDefined()
    expect(tool.description).toContain('TTS')
    expect(tool.parameters.required).toContain('contact')
    expect(tool.parameters.required).toContain('text')
    expect(tool.parameters.properties.contact).toBeDefined()
    expect(tool.parameters.properties.text).toBeDefined()
    expect(tool.parameters.properties.ptt).toBeDefined()
  })

  it('declares localized labels in locales.en-US and locales.pt-BR', () => {
    const enTool = (manifest.locales as any)?.['en-US']?.tools?.send_voice_note
    expect(enTool).toBeDefined()
    expect(enTool.label).toBeDefined()
    expect(enTool.description).toBeDefined()
  })
})
