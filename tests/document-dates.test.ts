import { describe, expect, it } from 'vitest'
import { addDays, dueDateFor } from '../tinycld/books/lib/document-dates'

describe('dueDateFor', () => {
    it('adds the term days to the invoice date', () => {
        expect(dueDateFor('2026-11-04', 'net_30')).toBe('2026-12-04')
        expect(dueDateFor('2026-11-04', 'net_10')).toBe('2026-11-14')
        expect(dueDateFor('2026-11-04', 'net_15')).toBe('2026-11-19')
        expect(dueDateFor('2026-11-04', 'net_60')).toBe('2027-01-03')
    })

    it('Due on receipt is the same day', () => {
        expect(dueDateFor('2026-11-04', 'due_on_receipt')).toBe('2026-11-04')
    })

    it('no terms gives no due date', () => {
        expect(dueDateFor('2026-11-04', '')).toBeNull()
    })

    it('crosses month, year and leap-day edges', () => {
        expect(dueDateFor('2028-01-31', 'net_30')).toBe('2028-03-01')
        expect(dueDateFor('2027-01-31', 'net_30')).toBe('2027-03-02')
        expect(dueDateFor('2026-12-15', 'net_30')).toBe('2027-01-14')
    })

    // The form calls it while the user types the date, so a part-typed or
    // impossible day gives no due date instead of a throw.
    it('gives no due date for a date that is not an ISO day', () => {
        expect(dueDateFor('2026-1', 'net_30')).toBeNull()
        expect(dueDateFor('2026-02-30', 'net_30')).toBeNull()
        expect(dueDateFor('', 'due_on_receipt')).toBeNull()
    })
})

describe('addDays', () => {
    it('adds calendar days to an ISO day', () => {
        expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
        expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
        expect(addDays('2026-11-04', 0)).toBe('2026-11-04')
    })

    it('is not moved by daylight saving time', () => {
        expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
        expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
        expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    })

    // A part-typed or impossible day gives no day instead of a RangeError.
    it('gives no day for a day that is not an ISO day', () => {
        expect(addDays('2026-1', 1)).toBeNull()
        expect(addDays('2026-02-30', 1)).toBeNull()
        expect(addDays('', 0)).toBeNull()
    })
})
