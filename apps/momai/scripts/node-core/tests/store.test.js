const { defaultStore } = require('../infrastructure/store')

test('defaultStore includes empty skillKeywords', () => {
  const store = defaultStore()
  expect(store.skillKeywords).toEqual({})
})
