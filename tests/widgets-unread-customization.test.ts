import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNREAD_LIMIT,
  isUnreadConfigCustomized,
  resolveUnreadLimit,
  UNREAD_LIMIT_CHOICES,
  WHATSAPP_UNREAD_CUSTOMIZATION
} from '../src/widgets/unreadCustomization'

describe('whatsapp unread widget customization', () => {
  it('resolves the conversation limit with a safe default', () => {
    expect(resolveUnreadLimit(undefined)).toBe(DEFAULT_UNREAD_LIMIT)
    expect(resolveUnreadLimit({})).toBe(DEFAULT_UNREAD_LIMIT)
    expect(resolveUnreadLimit({ limit: '5' })).toBe(5)
    expect(resolveUnreadLimit({ limit: 2 })).toBe(2)
    expect(resolveUnreadLimit({ limit: 'oops' })).toBe(DEFAULT_UNREAD_LIMIT)
  })

  it('treats only a non-default limit as customization', () => {
    expect(isUnreadConfigCustomized(undefined)).toBe(false)
    expect(isUnreadConfigCustomized({})).toBe(false)
    expect(isUnreadConfigCustomized({ limit: '3' })).toBe(false)
    expect(isUnreadConfigCustomized({ limit: '5' })).toBe(true)
  })

  it('exposes a declarative customization for the host dialog', () => {
    expect(typeof WHATSAPP_UNREAD_CUSTOMIZATION.isCustomized).toBe('function')
    expect(WHATSAPP_UNREAD_CUSTOMIZATION.defaults).toEqual({})
    expect(UNREAD_LIMIT_CHOICES).toEqual(['2', '3', '5'])
    const limit = WHATSAPP_UNREAD_CUSTOMIZATION.options.find((option: any) => option.key === 'limit')
    expect(limit?.kind).toBe('select')
  })
})
