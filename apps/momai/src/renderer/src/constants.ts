// Note: In production, these should ideally come from environment variables 
// or be passed from the main process.
export const API_HOST = '127.0.0.1'
export const API_PORT = 8000

export const API_URL = `http://${API_HOST}:${API_PORT}`
export const WS_URL = `ws://${API_HOST}:${API_PORT}/ws`
