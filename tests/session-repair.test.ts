import { describe, it, expect } from 'vitest'
import utils from '../worker-utils'

const {
  normalizeJidUser,
  isDecryptFailureDetail,
  shouldRepairSelfLid,
  buildSessionClearKeys,
  createDecryptFailureTracker,
  createRepairBudget
} = utils as any

describe('normalizeJidUser', () => {
  it('strips the LID server and device suffix', () => {
    expect(normalizeJidUser('211093884559589:30@lid')).toBe('211093884559589')
  })

  it('strips the PN server and device suffix', () => {
    expect(normalizeJidUser('554196596620:12@s.whatsapp.net')).toBe('554196596620')
  })

  it('handles group JIDs and empty values', () => {
    expect(normalizeJidUser('120363046098474271@g.us')).toBe('120363046098474271')
    expect(normalizeJidUser(null)).toBe('')
    expect(normalizeJidUser(undefined)).toBe('')
    expect(normalizeJidUser('')).toBe('')
  })
})

describe('isDecryptFailureDetail', () => {
  it('matches the libsignal/Baileys decrypt failures', () => {
    expect(isDecryptFailureDetail('Bad MAC')).toBe(true)
    expect(isDecryptFailureDetail('No matching sessions found for message')).toBe(true)
    expect(isDecryptFailureDetail('No session record')).toBe(true)
    expect(isDecryptFailureDetail('failed to decrypt message')).toBe(true)
  })

  it('does not match unrelated connection errors', () => {
    expect(isDecryptFailureDetail('stream errored out')).toBe(false)
    expect(isDecryptFailureDetail('')).toBe(false)
  })
})

describe('shouldRepairSelfLid', () => {
  const meLid = '211093884559589:30@lid'

  it('repairs an own DM failure using the account LID, not the chat JID', () => {
    expect(
      shouldRepairSelfLid(
        'Bad MAC',
        { id: 'ABC', fromMe: true, remoteJid: '554196596620@s.whatsapp.net' },
        meLid
      )
    ).toBe('211093884559589@lid')
  })

  it('repairs an own group failure even when remoteJid is a group', () => {
    expect(
      shouldRepairSelfLid(
        'No matching sessions found for message',
        { id: 'ABC', fromMe: true, remoteJid: '120363046098474271@g.us' },
        meLid
      )
    ).toBe('211093884559589@lid')
  })

  it('never repairs incoming contact messages', () => {
    expect(
      shouldRepairSelfLid(
        'Bad MAC',
        { id: 'ABC', fromMe: false, remoteJid: '554196863850@s.whatsapp.net' },
        meLid
      )
    ).toBeNull()
    expect(
      shouldRepairSelfLid(
        'Bad MAC',
        { id: 'ABC', fromMe: false, remoteJid: '211093884559589@lid' },
        meLid
      )
    ).toBeNull()
  })

  it('ignores transient failures and missing context', () => {
    expect(
      shouldRepairSelfLid('failed to decrypt message', { fromMe: true }, meLid)
    ).toBeNull()
    expect(shouldRepairSelfLid('Bad MAC', { fromMe: true }, '')).toBeNull()
    expect(shouldRepairSelfLid('Bad MAC', null, meLid)).toBeNull()
  })
})

describe('buildSessionClearKeys', () => {
  it('clears every device of the own LID and leaves other users alone', () => {
    const keys = buildSessionClearKeys('211093884559589@lid', [
      'session-211093884559589.0.json',
      'session-211093884559589.22.json',
      'session-554196596620.0.json'
    ])

    expect(keys['211093884559589.0']).toBeNull()
    expect(keys['211093884559589.22']).toBeNull()
    expect(keys['211093884559589']).toBeNull()
    expect(keys['554196596620.0']).toBeUndefined()
  })

  it('uses the normalized user when the jid carries a device suffix', () => {
    const keys = buildSessionClearKeys('211093884559589:30@lid', [
      'session-211093884559589.0.json'
    ])

    expect(keys['211093884559589.0']).toBeNull()
    expect(keys['211093884559589:30']).toBeUndefined()
  })

  it('keeps the Brazilian 9-digit alternate JID in scope', () => {
    const keys = buildSessionClearKeys(
      '554196596620@s.whatsapp.net',
      ['session-554196596620.0.json', 'session-554196863850.0.json'],
      '554196863850@s.whatsapp.net'
    )

    expect(keys['554196596620.0']).toBeNull()
    expect(keys['554196863850.0']).toBeNull()
  })
})

describe('createDecryptFailureTracker', () => {
  it('reports every threshold-th failure for the same message', () => {
    const tracker = createDecryptFailureTracker({ threshold: 3 })

    expect(tracker.record('m1')).toBe(false)
    expect(tracker.record('m1')).toBe(false)
    expect(tracker.record('m1')).toBe(true)
    expect(tracker.record('m1')).toBe(false)
    expect(tracker.record('m1')).toBe(false)
    expect(tracker.record('m1')).toBe(true)
  })

  it('tracks messages independently', () => {
    const tracker = createDecryptFailureTracker({ threshold: 2 })

    expect(tracker.record('a')).toBe(false)
    expect(tracker.record('b')).toBe(false)
    expect(tracker.record('a')).toBe(true)
    expect(tracker.record('b')).toBe(true)
  })

  it('bounds memory and supports reset/clear', () => {
    const tracker = createDecryptFailureTracker({ threshold: 2, maxEntries: 2 })

    tracker.record('a')
    tracker.record('b')
    tracker.record('c')
    expect(tracker.size).toBe(2)

    tracker.reset('c')
    expect(tracker.size).toBe(1)

    tracker.clear()
    expect(tracker.size).toBe(0)
  })

  it('restarts the count after a successful message (reset)', () => {
    const tracker = createDecryptFailureTracker({ threshold: 2 })

    expect(tracker.record('m1')).toBe(false)
    tracker.reset('m1')
    expect(tracker.record('m1')).toBe(false)
    expect(tracker.record('m1')).toBe(true)
  })
})

describe('createRepairBudget', () => {
  it('allows at most N repairs inside the window', () => {
    const budget = createRepairBudget({ max: 2, windowMs: 1000 })

    expect(budget.tryAcquire('lid', 0).allowed).toBe(true)
    expect(budget.tryAcquire('lid', 1).allowed).toBe(true)

    const exhausted = budget.tryAcquire('lid', 2)
    expect(exhausted.allowed).toBe(false)
    expect(exhausted.exhausted).toBe(true)
    expect(exhausted.attempts).toBe(2)
  })

  it('frees a slot after the window and isolates keys', () => {
    const budget = createRepairBudget({ max: 1, windowMs: 1000 })

    expect(budget.tryAcquire('a', 0).allowed).toBe(true)
    expect(budget.tryAcquire('b', 0).allowed).toBe(true)
    expect(budget.tryAcquire('a', 500).allowed).toBe(false)
    expect(budget.tryAcquire('a', 1001).allowed).toBe(true)
  })
})
