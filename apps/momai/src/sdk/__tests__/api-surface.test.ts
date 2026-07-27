import { describe, it, expect } from 'vitest'
import { getSDK } from '../runtime'
import { getAdapter } from '../adapter'

describe('SDK v1 surface', () => {
  const sdk = getSDK()

  it('must export all required modules', () => {
    expect(sdk).toHaveProperty('api')
    expect(sdk).toHaveProperty('storage')
    expect(sdk).toHaveProperty('events')
    expect(sdk).toHaveProperty('llm')
    expect(sdk).toHaveProperty('registry')
    expect(sdk).toHaveProperty('notifications')
    expect(sdk).toHaveProperty('theme')
    expect(sdk).toHaveProperty('scheduler')
    expect(sdk).toHaveProperty('oauth')
    expect(sdk).toHaveProperty('config')
    expect(sdk).toHaveProperty('process')
    expect(sdk).toHaveProperty('system')
    expect(sdk).toHaveProperty('browser')
    expect(sdk).toHaveProperty('has')
    expect(sdk).toHaveProperty('dev')
  })

  it('api must have all HTTP methods', () => {
    expect(sdk.api).toHaveProperty('get')
    expect(sdk.api).toHaveProperty('post')
    expect(sdk.api).toHaveProperty('put')
    expect(sdk.api).toHaveProperty('delete')
  })

  it('storage must have all methods', () => {
    expect(sdk.storage).toHaveProperty('get')
    expect(sdk.storage).toHaveProperty('set')
    expect(sdk.storage).toHaveProperty('getMany')
    expect(sdk.storage).toHaveProperty('setMany')
    expect(sdk.storage).toHaveProperty('delete')
    expect(sdk.storage).toHaveProperty('migrate')
    expect(sdk.storage).toHaveProperty('listKeys')
  })

  it('has should return true for known methods', () => {
    expect(sdk.has('api.get')).toBe(true)
    expect(sdk.has('storage.set')).toBe(true)
    expect(sdk.has('events.subscribe')).toBe(true)
    expect(sdk.has('llm.complete')).toBe(true)
    expect(sdk.has('not_fake_method')).toBe(false)
  })
})

describe('SDK adapter', () => {
  it('should return adapter for SDK v1', () => {
    const adapter = getAdapter(1)
    expect(adapter.version).toBe(1)
  })

  it('should fall back to latest version for unknown SDK version', () => {
    const adapter = getAdapter(999)
    expect(adapter.version).toBe(1)
  })
})
