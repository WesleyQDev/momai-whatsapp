import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRenderer, resetForTest } from './SkillResponseRegistry'
import { loadSkillRenderer } from './ExtensionRendererLoader'

describe('loadSkillRenderer', () => {
  beforeEach(() => {
    resetForTest()
  })

  it('injects registry shim and calls registerRenderer for page', async () => {
    const Comp = () => null
    const mod = { default: Comp }
    vi.doMock('/extensions/whatsapp/dist/page.js', () => mod)
    await loadSkillRenderer('whatsapp', { page: 'page.js', pageType: 'whatsapp-page' }, '/extensions/whatsapp/dist')
    expect(getRenderer('whatsapp-page')).toBe(Comp)
    // @ts-expect-error
    expect(global.window.__skillRendererRegistry.registerRenderer).toBeDefined()
  })

  it('skips panel when not provided', async () => {
    resetForTest()
    const mod = { default: () => null }
    vi.doMock('/x/p.js', () => mod)
    await loadSkillRenderer('x', { page: 'p.js', pageType: 't' }, '/x')
    expect(getRenderer('t')).toBe(mod.default)
  })
})

