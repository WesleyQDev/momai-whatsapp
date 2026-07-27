import { describe, it, expect } from 'vitest'
import { sdk, mockApi, mockStorage, mockEvents, mockTheme } from '../mock/index'

describe('Mock SDK', () => {
  beforeEach(() => {
    mockApi.reset()
    mockStorage.reset()
    mockEvents.reset()
    mockTheme.reset()
  })

  it('mockApi should record calls and resolve responses', async () => {
    mockApi._resolve('POST', '/extensions/whatsapp/send', { ok: true, data: { id: 'msg_123' } })

    const result = await sdk.api.post('/extensions/whatsapp/send', { to: 'João', text: 'Oi!' })

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ id: 'msg_123' })
    expect(mockApi.getCalls()).toHaveLength(1)
    expect(mockApi.getCalls()[0].method).toBe('POST')
    expect(mockApi.getCalls()[0].path).toBe('/extensions/whatsapp/send')
  })

  it('mockStorage should store and retrieve values', async () => {
    await sdk.storage.set('config', { theme: 'dark' })
    const val = await sdk.storage.get('config')
    expect(val).toEqual({ theme: 'dark' })
    expect(mockStorage.getSetCalls()).toHaveLength(1)
  })

  it('mockTheme should record setColors calls', async () => {
    await sdk.theme.setColors({ primary: '#000' })
    const calls = mockTheme.getSetColorsCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ primary: '#000' })
  })

  it('mockEvents should track subscriptions', async () => {
    const handler = () => {}
    sdk.events.subscribe('message', handler)
    expect(mockEvents.getSubscribeCalls()).toHaveLength(1)
    expect(mockEvents.getSubscribeCalls()[0].type).toBe('message')
  })
})
