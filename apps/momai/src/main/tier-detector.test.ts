import { describe, it, expect, vi } from 'vitest'

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

import { isAITier } from './python/bootstrap/tier-detector'

describe('isAITier', () => {
  it('returns true for lite', () => {
    expect(isAITier('lite')).toBe(true)
  })

  it('returns true for pro', () => {
    expect(isAITier('pro')).toBe(true)
  })

  it('returns true for ultra', () => {
    expect(isAITier('ultra')).toBe(true)
  })

  it('returns false for enterprise', () => {
    expect(isAITier('enterprise')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isAITier(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isAITier(undefined)).toBe(false)
  })
})
