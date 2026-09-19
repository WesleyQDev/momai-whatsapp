// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import manifest from '../manifest.json'

describe('whatsapp widgets manifest', () => {
  it('declares unread and last-message widgets for the gallery', () => {
    const widgets = (manifest as any)?.ui?.widgets ?? []
    const types = widgets.map((w: any) => w.type)
    expect(types).toContain('momai-whatsapp-unread-widget')
    expect(types).toContain('momai-whatsapp-last-message-widget')
  })

  it('points each widget entry at an existing bundle path', () => {
    const widgets = (manifest as any)?.ui?.widgets ?? []
    for (const widget of widgets) {
      expect(typeof widget.entry).toBe('string')
      expect(widget.entry.startsWith('dist/widget-')).toBe(true)
    }
  })
})
