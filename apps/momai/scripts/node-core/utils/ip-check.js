function isPrivateIp(address) {
  if (!address) return true

  if (address.includes('.')) {
    const parts = address.split('.').map(Number)
    if (parts.length !== 4 || parts.some((p) => isNaN(p))) return true

    if (parts[0] === 127) return true
    if (parts[0] === 10) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 0) return true
    if (parts[0] >= 224) return true
    return false
  }

  if (address.includes(':')) {
    const lower = address.toLowerCase()
    if (lower === '::1') return true
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    )
      return true
    if (lower === '::' || lower === '::ffff:0:0') return true
    return false
  }

  return true
}

module.exports = { isPrivateIp }
