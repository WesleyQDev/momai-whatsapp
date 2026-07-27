function inferExtensionTypes(manifest) {
  const types = []
  if (manifest.tools && Array.isArray(manifest.tools) && manifest.tools.length > 0) {
    types.push('skill')
  }
  if (manifest.ui && (manifest.ui.page || manifest.ui.panel)) {
    types.push('ui')
  }
  if (manifest.background === true) {
    types.push('background')
  }
  if (manifest.theme && (manifest.theme.colors || manifest.theme.fonts)) {
    types.push('theme')
  }
  return types.length > 0 ? types : ['skill']
}

function validateManifestTypes(manifest) {
  const types = inferExtensionTypes(manifest)
  if (types.includes('theme')) {
    const forbidden = []
    if (manifest.tools?.length) forbidden.push('tools')
    if (manifest.background) forbidden.push('background')
    if (manifest.storage) forbidden.push('storage')
    if (manifest.process) forbidden.push('process')
    if (manifest.shell) forbidden.push('shell')
    if (forbidden.length > 0) {
      throw new Error(`Extens\u00E3o do tipo 'tema' n\u00E3o pode declarar: ${forbidden.join(', ')}`)
    }
  }
  return types
}

module.exports = { inferExtensionTypes, validateManifestTypes }
