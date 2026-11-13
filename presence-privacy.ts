'use strict'

// Presence privacy rules that mirror WhatsApp's visibility categories:
// Todos (all), Meus contatos (contacts), Meus contatos exceto... (except) and
// Ninguém (none). Pure module: no I/O, no timers, so the worker and the tests
// share the exact same decision logic.
//
// The worker never delivers a presence field that the rules do not allow:
// `applyPresencePolicy` is the single gate used by both the `presence_update`
// event stream and the `get_presence` tool, so a field omitted there can never
// leak through another path.

const PRIVACY_MODES = ['all', 'contacts', 'except', 'none']
const MAX_EXCEPTIONS = 500

/**
 * @typedef {'all' | 'contacts' | 'except' | 'none'} PrivacyMode
 *
 * @typedef {{ mode: PrivacyMode, exceptions: string[] }} PrivacyRule
 *
 * @typedef {{ jid: string, phone?: string | null, isContact?: boolean }} PresenceSubject
 *
 * @typedef {{ online?: boolean, lastSeen?: number | null, updatedAt?: number }} PresenceSnapshot
 *
 * @typedef {{
 *   online: PrivacyRule,
 *   lastSeen: PrivacyRule,
 *   perContact: Record<string, { online?: PrivacyRule, lastSeen?: PrivacyRule }>,
 *   customized: boolean
 * }} PresencePrivacyPolicy
 */

/** @returns {boolean} whether `value` is one of the supported rule modes */
function isPrivacyMode(value: unknown): boolean {
  return typeof value === 'string' && PRIVACY_MODES.includes(value)
}

/** Keeps only digits so exceptions can be compared across jid/phone formats. */
function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

/** Normalizes a single rule; invalid input falls back to the safe `none`. */
function normalizeRule(raw: any, fallback?: any): any {
  const base = fallback && isPrivacyMode(fallback.mode) ? fallback : { mode: 'none', exceptions: [] }
  if (raw === undefined || raw === null) {
    return { mode: base.mode, exceptions: [...(base.exceptions || [])] }
  }
  const mode = typeof raw === 'string' ? raw : raw.mode
  if (!isPrivacyMode(mode)) {
    return { mode: base.mode, exceptions: [...(base.exceptions || [])] }
  }
  const list = Array.isArray(raw?.exceptions) ? raw.exceptions : []
  const exceptions: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    if (exceptions.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue
    exceptions.push(trimmed)
    if (exceptions.length >= MAX_EXCEPTIONS) break
  }
  return { mode, exceptions }
}

/** Normalizes a full policy, preserving valid fields and defaulting the rest. */
function normalizePolicy(raw: any): any {
  const source = raw && typeof raw === 'object' ? raw : {}
  const perContact: Record<string, any> = {}
  const rawPerContact = source.perContact && typeof source.perContact === 'object' ? source.perContact : {}
  for (const [key, value] of Object.entries<any>(rawPerContact)) {
    const normalizedKey = normalizeSubjectKey(key)
    if (!normalizedKey || !value || typeof value !== 'object') continue
    const override: Record<string, any> = {}
    if (value.online !== undefined) override.online = normalizeRule(value.online)
    if (value.lastSeen !== undefined) override.lastSeen = normalizeRule(value.lastSeen)
    if (Object.keys(override).length > 0) perContact[normalizedKey] = override
  }
  return {
    online: normalizeRule(source.online),
    lastSeen: normalizeRule(source.lastSeen),
    perContact,
    customized: source.customized === true
  }
}

/** Normalizes a contact key (`jid`, `phone` or bare digits) to digits when possible. */
function normalizeSubjectKey(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const digits = normalizePhone(text)
  return digits || text.toLowerCase()
}

/** Candidate keys of a subject, used to match per-contact overrides/exceptions. */
function subjectKeys(subject: any): Set<string> {
  const keys = new Set<string>()
  const jid = String(subject?.jid || '').trim().toLowerCase()
  if (jid) {
    keys.add(jid)
    const local = jid.split('@')[0].split(':')[0]
    if (local) {
      keys.add(local)
      const digits = normalizePhone(local)
      if (digits) keys.add(digits)
    }
  }
  const phone = normalizePhone(subject?.phone)
  if (phone) keys.add(phone)
  return keys
}

function matchesExceptions(exceptions: string[], subject: any): boolean {
  if (!Array.isArray(exceptions) || exceptions.length === 0) return false
  const keys = subjectKeys(subject)
  return exceptions.some((entry) => {
    const normalized = normalizeSubjectKey(entry)
    if (!normalized) return false
    if (keys.has(normalized)) return true
    const digits = normalizePhone(entry)
    return Boolean(digits) && keys.has(digits)
  })
}

/**
 * Evaluates one rule against a subject.
 *
 * @param {PrivacyRule} rule
 * @param {PresenceSubject} subject
 * @returns {boolean}
 */
function ruleAllows(rule: any, subject: any): boolean {
  const mode = rule?.mode
  if (mode === 'all') return true
  if (mode === 'none') return false
  const isContact = subject?.isContact === true
  if (mode === 'contacts') return isContact
  if (mode === 'except') return isContact && !matchesExceptions(rule?.exceptions || [], subject)
  return false
}

/**
 * Resolves the rule that applies to a feature for a subject: per-contact
 * override first, then the policy-wide rule for that feature.
 */
function resolveRule(policy: any, feature: any, subject: any): any {
  const keys = subjectKeys(subject)
  const overrides = policy?.perContact || {}
  for (const key of keys) {
    const override = overrides[key]
    if (override && override[feature]) return override[feature]
  }
  return policy?.[feature] || { mode: 'none', exceptions: [] }
}

/** Convenience wrapper used by the worker and the tests. */
function policyAllows(policy: any, feature: any, subject: any): boolean {
  return ruleAllows(resolveRule(policy, feature, subject), subject)
}

/**
 * Maps a WhatsApp privacy category value to a rule. `contact_blacklist` has no
 * server-side readable list, so the exceptions stay local to the policy.
 *
 * @param {unknown} value e.g. `all`, `contacts`, `contact_blacklist`, `none`
 * @returns {PrivacyRule | null} null when the value is unknown
 */
function ruleFromWhatsAppPrivacy(value: unknown): any {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'all') return { mode: 'all', exceptions: [] }
  if (text === 'contacts') return { mode: 'contacts', exceptions: [] }
  if (text === 'contact_blacklist') return { mode: 'except', exceptions: [] }
  if (text === 'none') return { mode: 'none', exceptions: [] }
  return null
}

/**
 * Builds the default policy from the account's own WhatsApp privacy choices so
 * the extension never invents a visibility rule.
 *
 * `online: match_last_seen` deliberately maps to `all` instead of mirroring the
 * last-seen rule: WhatsApp already applies that reciprocity server-side, so
 * mirroring it again here would hide "online" from anyone who is not in the
 * address book — even when the server sent the presence. The local rules stay
 * fully configurable by the user.
 *
 * Unknown categories default to `all`: the WhatsApp server is the authority on
 * what a contact allows others to see, so the local rules are an extra filter
 * the user controls — never a way to invent extra hiding.
 *
 * @param {Record<string, string>} settings result of `fetchPrivacySettings()`
 */
function derivePolicyFromWhatsAppPrivacy(settings: any): any {
  const source = settings && typeof settings === 'object' ? settings : {}
  const lastSeen = ruleFromWhatsAppPrivacy(source.last) || { mode: 'all', exceptions: [] }
  const onlineRaw = String(source.online ?? '').trim().toLowerCase()
  const online =
    onlineRaw === 'match_last_seen'
      ? { mode: 'all', exceptions: [] }
      : ruleFromWhatsAppPrivacy(onlineRaw) || { mode: 'all', exceptions: [] }
  return {
    online,
    lastSeen,
    perContact: {},
    customized: false
  }
}

/**
 * Policy used before the account categories are known and whenever the user
 * never customized anything: show what WhatsApp already allows (the server
 * enforces the contact's privacy), with no local extra filter.
 */
function createDefaultPolicy(): any {
  return {
    online: { mode: 'all', exceptions: [] },
    lastSeen: { mode: 'all', exceptions: [] },
    perContact: {},
    customized: false
  }
}

/** A subscription is only worth it when at least one field may be exposed. */
function shouldSubscribePresence(policy: any, subject: any): boolean {
  return policyAllows(policy, 'online', subject) || policyAllows(policy, 'lastSeen', subject)
}

/**
 * Normalizes a Baileys `presence.update` entry. `lastSeen` arrives in seconds.
 *
 * @param {{ lastKnownPresence?: string, lastSeen?: number }} data
 * @returns {{ online: boolean, lastSeen: number | null }}
 */
function parsePresenceData(data: any): any {
  const online = data?.lastKnownPresence === 'available'
  const raw = Number(data?.lastSeen)
  const lastSeen = Number.isFinite(raw) && raw > 0 ? Math.round(raw * 1000) : null
  return { online, lastSeen }
}

/**
 * Applies the policy to a raw presence entry. Fields the subject may not see
 * are omitted from the result, so callers can expose the object as-is.
 *
 * @param {PresencePrivacyPolicy} policy
 * @param {PresenceSubject} subject
 * @param {{ lastKnownPresence?: string, lastSeen?: number }} data
 * @returns {{ online?: boolean, lastSeen?: number }}
 */
function applyPresencePolicy(policy: any, subject: any, data: any): any {
  const parsed = parsePresenceData(data)
  const result: any = {}
  if (policyAllows(policy, 'online', subject)) result.online = parsed.online
  if (policyAllows(policy, 'lastSeen', subject) && parsed.lastSeen) result.lastSeen = parsed.lastSeen
  return result
}

/**
 * Drops cached "online" after the TTL so a dead/silent socket does not keep a
 * contact shown as online forever. Last seen is historical and never expires.
 */
function isPresenceFresh(entry: any, now: number, ttlMs: number): boolean {
  const updatedAt = Number(entry?.updatedAt) || 0
  return Boolean(updatedAt) && Number(now) - updatedAt <= Number(ttlMs)
}

module.exports = {
  PRIVACY_MODES,
  MAX_EXCEPTIONS,
  isPrivacyMode,
  normalizePhone,
  normalizeSubjectKey,
  normalizeRule,
  normalizePolicy,
  subjectKeys,
  ruleAllows,
  resolveRule,
  policyAllows,
  ruleFromWhatsAppPrivacy,
  derivePolicyFromWhatsAppPrivacy,
  createDefaultPolicy,
  shouldSubscribePresence,
  parsePresenceData,
  applyPresencePolicy,
  isPresenceFresh
}
