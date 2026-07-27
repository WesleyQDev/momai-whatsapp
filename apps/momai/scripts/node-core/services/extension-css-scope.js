/**
 * CSS Scoping utility for extensions.
 * Prefixes all CSS selectors with .ext-{id} to prevent conflicts.
 */

function scopeCSS(css, extId) {
  const prefix = `.ext-${extId}`
  
  // Replace bare selectors with scoped versions
  // Matches CSS rules like: .class { ... } or #id { ... }
  return css.replace(/([.#][a-zA-Z0-9_-]+)\s*\{/g, `${prefix} $1 {`)
}

module.exports = { scopeCSS }
