import { registerRenderer } from './SkillResponseRegistry'
import GenericExtensionCard from './GenericExtensionCard'

registerRenderer('generic-extension', GenericExtensionCard)

interface SkillUi {
  page?: string
  pageType?: string
  panel?: string
  panelType?: string
}

declare global {
  interface Window {
    __skillRendererRegistry?: {
      registerRenderer: (type: string, component: React.ComponentType<any>) => void
    }
  }
}

export async function loadSkillRenderer(
  skillId: string,
  ui: SkillUi,
  baseUrl: string
): Promise<void> {
  if (typeof window !== 'undefined') {
    window.__skillRendererRegistry = { registerRenderer }
  }
  if (ui.page && ui.pageType) {
    const key = `${skillId}:${ui.page}`
    let mod = pageCache.get(key)
    if (!mod) {
      mod = (await import(/* @vite-ignore */ `${baseUrl}/${ui.page}`)) as any
      pageCache.set(key, mod)
    }
    registerRenderer(ui.pageType, mod.default)
  }
  if (ui.panel && ui.panelType) {
    const key = `${skillId}:${ui.panel}`
    let mod = panelCache.get(key)
    if (!mod) {
      mod = (await import(/* @vite-ignore */ `${baseUrl}/${ui.panel}`)) as any
      panelCache.set(key, mod)
    }
    registerRenderer(ui.panelType, mod.default)
  }
}

const pageCache = new Map<string, any>()
const panelCache = new Map<string, any>()

function ScopedExtensionContainer({ extId, children, styles }: { extId: string; children: React.ReactNode; styles?: string }) {
  return (
    <div className={`ext-${extId}`}>
      {styles && <style>{styles}</style>}
      {children}
    </div>
  )
}

export { GenericExtensionCard, ScopedExtensionContainer }
