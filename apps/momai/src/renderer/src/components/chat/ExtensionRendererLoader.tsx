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
    const mod = await import(/* @vite-ignore */ `${baseUrl}/${ui.page}`)
    registerRenderer(ui.pageType, mod.default)
  }
  if (ui.panel && ui.panelType) {
    const mod = await import(/* @vite-ignore */ `${baseUrl}/${ui.panel}`)
    registerRenderer(ui.panelType, mod.default)
  }
}

export { GenericExtensionCard }
