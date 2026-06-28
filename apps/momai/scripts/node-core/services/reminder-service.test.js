// TDD: verifies retention-based purging of inactive reminders.
// R003 (privacy plan): reminders inactive for more than
// MOMAI_REMINDER_RETENTION_DAYS should be auto-purged to prevent
// unbounded growth of `reminders[]` in node-core-store.json.
//
// See Task 2.3 of the privacy plan:
//   docs/superpowers/plans/2026-06-23-momai-privacy-data-cleanup.md (R003)

const { purgeExpiredReminders } = require('./reminder-service')

describe('purgeExpiredReminders', () => {
  it('keeps active reminders regardless of age', () => {
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const result = purgeExpiredReminders([{ id: 1, is_active: true, scheduled_time: old }])
    expect(result).toHaveLength(1)
  })

  it('removes inactive reminders older than 30 days', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const recent = new Date().toISOString()
    const result = purgeExpiredReminders([
      { id: 1, is_active: false, scheduled_time: old },
      { id: 2, is_active: false, scheduled_time: recent }
    ])
    expect(result.map((r) => r.id)).toEqual([2])
  })

  it('uses expires_at when present, falling back to scheduled_time', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const recentExpires = new Date().toISOString()
    const result = purgeExpiredReminders([
      // scheduled_time is old but expires_at is recent -> keep
      { id: 1, is_active: false, scheduled_time: old, expires_at: recentExpires },
      // no expires_at, scheduled_time is old -> remove
      { id: 2, is_active: false, scheduled_time: old }
    ])
    expect(result.map((r) => r.id)).toEqual([1])
  })
})
