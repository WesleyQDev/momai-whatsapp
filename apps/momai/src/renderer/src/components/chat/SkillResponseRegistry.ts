// Registry for structured response renderers by type
// New types can be registered via registerRenderer(type, Component)

const renderers = new Map()

export const registerRenderer = (type, rendererComponent) => {
  renderers.set(type, rendererComponent)
}

export const getRenderer = (type) => {
  return renderers.get(type) || null
}

export const hasRenderer = (type) => {
  return renderers.has(type)
}

export const listRendererTypes = () => {
  return Array.from(renderers.keys())
}

export const resetForTest = () => renderers.clear()
