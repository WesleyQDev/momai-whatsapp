// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  RECENT_CONVERSATIONS_STORAGE_KEY,
  applyRecentConversations,
  buildConversationAliases,
  emptyRecentConversations,
  isConversationVisible,
  isMessageHiddenByLedger,
  loadRecentConversations,
  markConversationDeleted,
  persistRecentConversations,
  seedDeletedConversations
} from '../src/utils/recentConversations'

const PHONE_JID = '554196863850@s.whatsapp.net'
const PHONE_LID = '211093884559589@lid'
const GROUP_JID = '120363409570599269@g.us'

const item = (overrides: Record<string, unknown> = {}) => ({
  jid: PHONE_JID,
  aliases: [PHONE_JID],
  label: 'Paisão',
  isGroup: false,
  lastMessageAt: 1000,
  ...overrides
})

beforeEach(() => {
  localStorage.clear()
})

describe('buildConversationAliases', () => {
  it('unifies device suffixes and keeps the digits alias', () => {
    const aliases = buildConversationAliases(['554196863850:12@s.whatsapp.net'])
    expect(aliases).toContain('554196863850@s.whatsapp.net')
    expect(aliases).toContain('554196863850')
  })

  it('unifies raw numbers with JIDs', () => {
    const aliases = buildConversationAliases(['554196863850'])
    expect(aliases).toEqual(['554196863850'])
  })

  it('does not add participant aliases for groups', () => {
    const aliases = buildConversationAliases([GROUP_JID], true)
    expect(aliases).toEqual([GROUP_JID])
  })
})

describe('recent conversations ledger', () => {
  it('keeps a deleted conversation hidden while a stale sync returns its old messages', () => {
    const now = 1_700_000_000_000
    let store = emptyRecentConversations()
    store = markConversationDeleted(store, item({ lastMessageAt: 1_600_000_000 }), now)

    // WhatsApp re-sync returns the same chat (same timestamps) after restart.
    const afterSync = applyRecentConversations(
      store,
      [item({ lastMessageAt: 1_600_000_000, aliases: [PHONE_JID] })],
      now + 60_000
    )

    expect(afterSync).toBe(store)
    expect(isConversationVisible(afterSync, item({ lastMessageAt: 1_600_000_000 }))).toBe(false)
    expect(
      isMessageHiddenByLedger(afterSync, { jid: PHONE_JID, timestamp: 1_600_000_000 })
    ).toBe(true)
  })

  it('revives the conversation when a newer message arrives', () => {
    const now = 1_700_000_000_000
    let store = markConversationDeleted(emptyRecentConversations(), item({ lastMessageAt: 1_600_000_000 }), now)

    const newerSeconds = Math.floor(now / 1000) + 30
    store = applyRecentConversations(store, [item({ lastMessageAt: newerSeconds })], now + 1000)

    expect(store.entries[0].deletedAt).toBeNull()
    expect(isConversationVisible(store, item({ lastMessageAt: newerSeconds }))).toBe(true)
    expect(isMessageHiddenByLedger(store, { jid: PHONE_JID, timestamp: 1_600_000_000 })).toBe(false)
  })

  it('matches the deletion across @lid and @s.whatsapp.net formats', () => {
    const now = 1_700_000_000_000
    const store = markConversationDeleted(
      emptyRecentConversations(),
      item({ jid: PHONE_LID, aliases: [PHONE_LID, '554196863850'], lastMessageAt: 1_600_000_000 }),
      now
    )

    expect(
      isMessageHiddenByLedger(store, { jid: '554196863850@s.whatsapp.net', timestamp: 1_600_000_000 })
    ).toBe(true)
    expect(
      isConversationVisible(store, {
        jid: '554196863850@s.whatsapp.net',
        aliases: ['554196863850@s.whatsapp.net'],
        isGroup: false,
        lastMessageAt: 1_600_000_000
      })
    ).toBe(false)
  })

  it('does not let one group hide another conversation', () => {
    const now = 1_700_000_000_000
    const store = markConversationDeleted(
      emptyRecentConversations(),
      item({ jid: GROUP_JID, aliases: [GROUP_JID], isGroup: true, lastMessageAt: 1_600_000_000 }),
      now
    )

    expect(
      isMessageHiddenByLedger(store, {
        jid: '120363111111111111@g.us',
        senderJid: '554196863850@s.whatsapp.net',
        isGroup: true,
        timestamp: 1_600_000_000
      })
    ).toBe(false)
    expect(isConversationVisible(store, { jid: PHONE_JID, lastMessageAt: 1_600_000_000 })).toBe(true)
  })

  it('a deleted 1:1 conversation does not hide a group message from that member', () => {
    const now = 1_700_000_000_000
    const store = markConversationDeleted(
      emptyRecentConversations(),
      item({ jid: PHONE_JID, aliases: [PHONE_JID], lastMessageAt: 1_600_000_000 }),
      now
    )

    expect(
      isMessageHiddenByLedger(store, {
        jid: GROUP_JID,
        senderJid: PHONE_JID,
        isGroup: true,
        timestamp: 1_600_000_000
      })
    ).toBe(false)
  })

  it('returns the same store reference when nothing changed', () => {
    const now = 1_700_000_000_000
    const store = applyRecentConversations(
      emptyRecentConversations(),
      [item({ lastMessageAt: 1_600_000_000 })],
      now
    )
    const again = applyRecentConversations(store, [item({ lastMessageAt: 1_600_000_000 })], now + 10_000)
    expect(again).toBe(store)
  })

  it('backfills a missing tombstone from the worker history response', () => {
    const deletedAtSeconds = 1_700_000_000
    const store = seedDeletedConversations(emptyRecentConversations(), [
      { jid: '554196863850@lid', deletedAt: deletedAtSeconds }
    ])
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].deletedAt).toBe(deletedAtSeconds * 1000)
    expect(
      isMessageHiddenByLedger(store, { jid: PHONE_JID, timestamp: deletedAtSeconds - 10 })
    ).toBe(true)
  })

  it('applies the worker tombstone over an active entry with older messages', () => {
    const deletedAtSeconds = 1_700_000_000
    const active = applyRecentConversations(
      emptyRecentConversations(),
      [item({ lastMessageAt: deletedAtSeconds - 60 })],
      deletedAtSeconds * 1000 - 1000
    )
    const store = seedDeletedConversations(active, [{ jid: PHONE_JID, deletedAt: deletedAtSeconds }])
    expect(store.entries[0].deletedAt).toBe(deletedAtSeconds * 1000)
  })

  it('does not re-delete a conversation revived by a newer message', () => {
    const deletedAtSeconds = 1_700_000_000
    const revived = applyRecentConversations(
      markConversationDeleted(emptyRecentConversations(), item({ lastMessageAt: 1 }), deletedAtSeconds * 1000),
      [item({ lastMessageAt: deletedAtSeconds + 30 })],
      deletedAtSeconds * 1000 + 1000
    )
    const store = seedDeletedConversations(revived, [{ jid: PHONE_JID, deletedAt: deletedAtSeconds }])
    expect(store).toBe(revived)
    expect(store.entries[0].deletedAt).toBeNull()
  })

  it('seeds durable tombstones from legacy deleted JIDs and persists them', () => {
    const store = loadRecentConversations([PHONE_JID])
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].deletedAt).toBeTypeOf('number')
    expect(
      isMessageHiddenByLedger(store, { jid: PHONE_JID, timestamp: Math.floor(Date.now() / 1000) })
    ).toBe(true)

    const raw = localStorage.getItem(RECENT_CONVERSATIONS_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string).entries).toHaveLength(1)
  })

  it('does not overwrite a revived conversation when seeding again', () => {
    const now = 1_700_000_000_000
    const revived = applyRecentConversations(
      markConversationDeleted(emptyRecentConversations(), item({ lastMessageAt: 1 }), now),
      [item({ lastMessageAt: Math.floor(now / 1000) + 5 })],
      now
    )
    persistRecentConversations(revived)

    const seeded = loadRecentConversations([PHONE_JID])
    expect(seeded.entries[0].deletedAt).toBeNull()
    expect(seeded.entries[0].lastMessageAt).toBe(Math.floor(now / 1000) + 5)
  })
})
