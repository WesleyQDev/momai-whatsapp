let _safeMode = false

function isSafeMode() {
  return _safeMode
}

function setSafeMode(enabled) {
  _safeMode = enabled
  console.log(`[safe-mode] Safe mode ${enabled ? 'enabled' : 'disabled'}`)
}

function toggleSafeMode() {
  _safeMode = !_safeMode
  console.log(`[safe-mode] Safe mode toggled to ${_safeMode}`)
}

module.exports = { isSafeMode, setSafeMode, toggleSafeMode }
