export function createRegistry() {
  const renderers = new Map<string, any>()

  return {
    registerRenderer(type: string, component: any): void { renderers.set(type, component) },
    getRenderer(type: string): any { return renderers.get(type) },
    hasRenderer(type: string): boolean { return renderers.has(type) },
    listRendererTypes(): string[] { return [...renderers.keys()] }
  }
}
