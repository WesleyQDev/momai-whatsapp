const { defaultStore } = require('../infrastructure/store')

test('defaultStore includes empty skillKeywords', () => {
  const store = defaultStore()
  expect(store.skillKeywords).toEqual({})
})

test('defaultStore includes expected default settings', () => {
  const store = defaultStore()
  expect(store.settings.daily_briefing_enabled).toBe(false)
  expect(store.settings.greeting_auto_saudacao).toBe(true)
  expect(store.settings.greeting_resumo).toBe(true)
  expect(store.settings.greeting_acao).toBe('')
  expect(store.settings.greeting_fixa).toBe('')
})
