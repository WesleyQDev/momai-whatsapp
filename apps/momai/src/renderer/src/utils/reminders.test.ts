import { describe, it, expect } from 'vitest'
import { getNextOccurrence, getOccurrenceForDate } from './reminders'

const makeReminder = (overrides = {}) => ({
  scheduled_time: '2026-05-08T10:00:00.000Z',
  repeat_interval: null,
  repeat_value: null,
  ...overrides,
})

describe('getNextOccurrence', () => {
  it('returns base time for non-repeating reminder', () => {
    const r = makeReminder()
    const result = getNextOccurrence(r)
    expect(result).toEqual(new Date('2026-05-08T10:00:00.000Z'))
  })

  it('returns base time when now is before scheduled time', () => {
    const r = makeReminder({ repeat_interval: 'days', repeat_value: 1 })
    const now = new Date('2026-05-07T00:00:00.000Z')
    const result = getNextOccurrence(r, now)
    expect(result).toEqual(new Date('2026-05-08T10:00:00.000Z'))
  })

  it('calculates next daily occurrence when past due', () => {
    const r = makeReminder({ repeat_interval: 'days', repeat_value: 1 })
    const now = new Date('2026-05-10T12:00:00.000Z')
    const result = getNextOccurrence(r, now)
    expect(result).toEqual(new Date('2026-05-11T10:00:00.000Z'))
  })

  it('calculates next weekly occurrence', () => {
    const r = makeReminder({ repeat_interval: 'weeks', repeat_value: 1 })
    const now = new Date('2026-05-20T12:00:00.000Z')
    const result = getNextOccurrence(r, now)
    expect(result).toEqual(new Date('2026-05-22T10:00:00.000Z'))
  })

  it('calculates next monthly occurrence', () => {
    const r = makeReminder({ repeat_interval: 'months', repeat_value: 1 })
    const now = new Date('2026-07-10T12:00:00.000Z')
    const result = getNextOccurrence(r, now)
    expect(result).toEqual(new Date('2026-08-08T10:00:00.000Z'))
  })

  it('handles hourly intervals', () => {
    const r = makeReminder({ repeat_interval: 'hours', repeat_value: 1 })
    const now = new Date('2026-05-08T13:15:00.000Z')
    const result = getNextOccurrence(r, now)
    expect(result).toEqual(new Date('2026-05-08T14:00:00.000Z'))
  })

  it('handles minute intervals', () => {
    const r = makeReminder({ repeat_interval: 'minutes', repeat_value: 5 })
    const now = new Date('2026-05-08T10:13:00.000Z')
    const result = getNextOccurrence(r, now)
    expect(result).toEqual(new Date('2026-05-08T10:15:00.000Z'))
  })
})

describe('getOccurrenceForDate', () => {
  it('returns time for simple reminder on correct day', () => {
    const r = makeReminder()
    const day = new Date('2026-05-08T12:00:00.000Z')
    const result = getOccurrenceForDate(r, day)
    expect(result).toEqual(new Date('2026-05-08T10:00:00.000Z'))
  })

  it('returns null for simple reminder on wrong day', () => {
    const r = makeReminder()
    const day = new Date('2026-05-09T12:00:00.000Z')
    const result = getOccurrenceForDate(r, day)
    expect(result).toBeNull()
  })

  it('returns null when occurrence is before base time (reminder in future)', () => {
    const r = makeReminder({ repeat_interval: 'days', repeat_value: 1 })
    const day = new Date('2026-05-07T12:00:00.000Z')
    const result = getOccurrenceForDate(r, day)
    expect(result).toBeNull()
  })
})
