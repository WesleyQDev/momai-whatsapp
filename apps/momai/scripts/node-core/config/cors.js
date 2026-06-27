const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function isLocalLoopbackOrigin(origin) {
  try {
    const url = new URL(origin)
    return (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    )
  } catch {
    return false
  }
}

function getAllowedOrigins() {
  if (process.env.NODE_ENV === 'production') {
    return ['file://']
  }
  return DEV_ORIGINS
}

function isOriginAllowed(origin) {
  if (!origin) return false
  if (origin === 'file://') return true
  if (isLocalLoopbackOrigin(origin)) return true
  if (process.env.NODE_ENV === 'production') return false
  return DEV_ORIGINS.includes(origin)
}

module.exports = { getAllowedOrigins, isOriginAllowed, isLocalLoopbackOrigin }
