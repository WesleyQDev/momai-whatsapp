import { describe, it, expect } from 'vitest'
import privacy from '../presence-privacy'

const {
  normalizeRule,
  normalizePolicy,
  ruleAllows,
  resolveRule,
  policyAllows,
  ruleFromWhatsAppPrivacy,
  derivePolicyFromWhatsAppPrivacy,
  createDefaultPolicy,
  shouldSubscribePresence,
  parsePresenceData,
  applyPresencePolicy,
  isPresenceFresh,
  PRIVACY_MODES
} = privacy as any

const contact = { jid: '5541999999999@s.whatsapp.net', phone: '5541999999999', isContact: true }
const stranger = { jid: '4248494461149@lid', phone: '4248494461149', isContact: false }

describe('presence privacy modes', () => {
  it('exposes exactly the WhatsApp categories', () => {
    expect(PRIVACY_MODES).toEqual(['all', 'contacts', 'except', 'none'])
  })

  it('all allows everyone, none allows nobody', () => {
    expect(ruleAllows({ mode: 'all', exceptions: [] }, stranger)).toBe(true)
    expect(ruleAllows({ mode: 'none', exceptions: [] }, contact)).toBe(false)
  })

  it('contacts only allows address-book contacts', () => {
    expect(ruleAllows({ mode: 'contacts', exceptions: [] }, contact)).toBe(true)
    expect(ruleAllows({ mode: 'contacts', exceptions: [] }, stranger)).toBe(false)
  })

  it('except allows contacts minus the listed ones (jid or digits)', () => {
    const rule = { mode: 'except', exceptions: ['5541999999999'] }
    expect(ruleAllows(rule, contact)).toBe(false)
    expect(ruleAllows(rule, { ...contact, jid: '5541888888888@s.whatsapp.net', phone: '5541888888888' })).toBe(true)
    expect(ruleAllows(rule, stranger)).toBe(false)
    const byJid = { mode: 'except', exceptions: ['5541999999999@s.whatsapp.net'] }
    expect(ruleAllows(byJid, contact)).toBe(false)
  })
})

describe('policy normalization', () => {
  it('falls back to none for unknown modes', () => {
    expect(normalizeRule({ mode: 'everyone' }).mode).toBe('none')
    expect(normalizeRule('contacts').mode).toBe('contacts')
    expect(normalizeRule(null, { mode: 'all', exceptions: [] }).mode).toBe('all')
  })

  it('dedupes exceptions and drops non-strings', () => {
    const rule = normalizeRule({ mode: 'except', exceptions: [' 55 ', '55', 42, ''] })
    expect(rule.exceptions).toEqual(['55'])
  })

  it('keeps per-contact overrides keyed by digits', () => {
    const policy = normalizePolicy({
      online: { mode: 'contacts' },
      lastSeen: { mode: 'none' },
      perContact: { '5541999999999@s.whatsapp.net': { online: { mode: 'all' } } }
    })
    expect(policy.perContact['5541999999999'].online.mode).toBe('all')
    expect(policy.customized).toBe(false)
  })
})

describe('rule resolution and delivery gating', () => {
  const policy = normalizePolicy({
    online: { mode: 'contacts' },
    lastSeen: { mode: 'none' },
    perContact: { '4248494461149': { lastSeen: { mode: 'all' } } }
  })

  it('per-contact override wins over the global rule', () => {
    expect(policyAllows(policy, 'online', stranger)).toBe(false)
    expect(policyAllows(policy, 'lastSeen', stranger)).toBe(true)
    expect(resolveRule(policy, 'lastSeen', stranger).mode).toBe('all')
  })

  it('only subscribes when at least one field is visible', () => {
    expect(shouldSubscribePresence(policy, contact)).toBe(true)
    expect(shouldSubscribePresence(policy, stranger)).toBe(true)
    const closed = normalizePolicy({ online: { mode: 'none' }, lastSeen: { mode: 'none' } })
    expect(shouldSubscribePresence(closed, contact)).toBe(false)
  })

  it('drops denied fields from the payload entirely', () => {
    const payload = applyPresencePolicy(policy, stranger, {
      lastKnownPresence: 'available',
      lastSeen: 1794395000
    })
    expect(payload).toEqual({ lastSeen: 1794395000000 })
    expect('online' in payload).toBe(false)
  })

  it('keeps a legitimately offline status', () => {
    const payload = applyPresencePolicy(policy, contact, { lastKnownPresence: 'unavailable' })
    expect(payload).toEqual({ online: false })
  })

  it('never returns presence when nothing is allowed', () => {
    const closed = normalizePolicy({ online: { mode: 'none' }, lastSeen: { mode: 'none' } })
    expect(applyPresencePolicy(closed, contact, { lastKnownPresence: 'available' })).toEqual({})
  })
})

describe('WhatsApp privacy mirror', () => {
  it('maps every category', () => {
    expect(ruleFromWhatsAppPrivacy('all').mode).toBe('all')
    expect(ruleFromWhatsAppPrivacy('contacts').mode).toBe('contacts')
    expect(ruleFromWhatsAppPrivacy('contact_blacklist').mode).toBe('except')
    expect(ruleFromWhatsAppPrivacy('none').mode).toBe('none')
    expect(ruleFromWhatsAppPrivacy('unknown')).toBeNull()
  })

  it('derives the policy from the account settings', () => {
    const policy = derivePolicyFromWhatsAppPrivacy({ last: 'contacts', online: 'all' })
    expect(policy.lastSeen.mode).toBe('contacts')
    expect(policy.online.mode).toBe('all')
    expect(policy.customized).toBe(false)
  })

  it('does not double-gate online when WhatsApp says match_last_seen', () => {
    const policy = derivePolicyFromWhatsAppPrivacy({ last: 'contact_blacklist', online: 'match_last_seen' })
    // O servidor já aplica a reciprocidade; espelhar aqui esconderia o online
    // de quem não está na agenda mesmo quando o WhatsApp envia a presença.
    expect(policy.online.mode).toBe('all')
    expect(policy.lastSeen.mode).toBe('except')
  })

  it('falls back to all when the categories are missing (the server already gates visibility)', () => {
    const policy = derivePolicyFromWhatsAppPrivacy({})
    expect(policy.online.mode).toBe('all')
    expect(policy.lastSeen.mode).toBe('all')
  })

  it('starts permissive until the account categories are known', () => {
    const policy = createDefaultPolicy()
    expect(policy.online.mode).toBe('all')
    expect(policy.lastSeen.mode).toBe('all')
    expect(policy.customized).toBe(false)
  })
})

describe('presence parsing', () => {
  it('converts last seen seconds to milliseconds', () => {
    expect(parsePresenceData({ lastKnownPresence: 'unavailable', lastSeen: 1794395000 })).toEqual({
      online: false,
      lastSeen: 1794395000000
    })
  })

  it('treats a missing last seen as null', () => {
    expect(parsePresenceData({ lastKnownPresence: 'available' })).toEqual({
      online: true,
      lastSeen: null
    })
  })

  it('expires stale online state after the TTL', () => {
    const entry = { online: true, updatedAt: 1_000 }
    expect(isPresenceFresh(entry, 1_500, 1_000)).toBe(true)
    expect(isPresenceFresh(entry, 2_500, 1_000)).toBe(false)
    expect(isPresenceFresh({}, 2_500, 1_000)).toBe(false)
  })
})
