const { isPublicPath } = require('../api/router.js')

describe('chat history / sessions / voice-command auth (M7)', () => {
  it('/chat/history is NOT in PUBLIC_PATHS (GET)', () => {
    expect(isPublicPath('/chat/history', 'GET')).toBe(false)
  })

  it('/chat/history is NOT in PUBLIC_PATHS (DELETE)', () => {
    expect(isPublicPath('/chat/history', 'DELETE')).toBe(false)
  })

  it('/chat/sessions is NOT in PUBLIC_PATHS', () => {
    expect(isPublicPath('/chat/sessions', 'GET')).toBe(false)
  })

  it('/chat/voice-command is NOT in PUBLIC_PATHS', () => {
    expect(isPublicPath('/chat/voice-command', 'POST')).toBe(false)
  })
})
