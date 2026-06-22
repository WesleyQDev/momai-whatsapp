const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

const PROD_ORIGINS = ['file://']

function getAllowedOrigins() {
  if (process.env.NODE_ENV === 'production') {
    return PROD_ORIGINS
  }
  return DEV_ORIGINS
}

function isOriginAllowed(origin) {
  return getAllowedOrigins().includes(origin)
}

module.exports = { getAllowedOrigins, isOriginAllowed }
