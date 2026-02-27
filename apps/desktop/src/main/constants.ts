export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 8000

export const API_HOST = process.env.HOST || DEFAULT_HOST
export const API_PORT = parseInt(process.env.PORT || String(DEFAULT_PORT))

export const API_BASE_URL = `http://${API_HOST}:${API_PORT}`
export const WS_BASE_URL = `ws://${API_HOST}:${API_PORT}/ws`
