describe('economy store defaults', () => {
  test('defaultStore contains economy config', () => {
    const { defaultStore } = require('../infrastructure/store')
    const store = defaultStore()

    expect(store.economy).toBeDefined()
    expect(store.economy.gaming_mode_enabled).toBe(true)
    expect(typeof store.economy.idle_timeout_app_open).toBe('number')
    expect(typeof store.economy.idle_timeout_minimized).toBe('number')
    expect(store.economy.auto_detect_known_games).toBe(true)
    expect(Array.isArray(store.economy.gaming_apps)).toBe(true)
    expect(typeof store.economy.next_gaming_app_id).toBe('number')
  })
})
