import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { declineNoteOf } from '../tinycld/books/lib/estimate-decline-note'
import { LONG_DECLINE_REASON } from '../tinycld/books/lib/estimate-public-link-fixture'

// The Books decline note (estimate-public-link spec §3.5): shown while the stored status is
// Rejected and the newest response is a decline; its date is the response's `created` day
// in the local time zone, as formatDay writes it; the reason is shown unchanged.

const CREATED = '2026-11-11 16:42:10.000Z'

const DECLINE = { decision: 'declined', reason: LONG_DECLINE_REASON, created: CREATED } as const

describe('declineNoteOf', () => {
    const zone = process.env.TZ

    beforeEach(() => {
        process.env.TZ = 'UTC'
    })

    afterEach(() => {
        if (zone === undefined) delete process.env.TZ
        else process.env.TZ = zone
    })

    it('is the decline date and the reason unchanged, line breaks kept', () => {
        expect(LONG_DECLINE_REASON).toContain('\n')
        expect(declineNoteOf('rejected', DECLINE)).toEqual({
            date: 'Nov 11, 2026',
            reason: LONG_DECLINE_REASON,
        })
    })

    it('has an empty reason for a decline with no reason', () => {
        expect(declineNoteOf('rejected', { ...DECLINE, reason: '' })).toEqual({
            date: 'Nov 11, 2026',
            reason: '',
        })
    })

    it.each([
        'pending',
        'accepted',
        'closed',
    ] as const)('is null while the status is %s', status => {
        expect(declineNoteOf(status, DECLINE)).toBeNull()
    })

    it('is null with no status', () => {
        expect(declineNoteOf(undefined, DECLINE)).toBeNull()
    })

    it('is null when the estimate has no response', () => {
        expect(declineNoteOf('rejected', undefined)).toBeNull()
    })

    // A writer set Rejected by hand after the customer's accept.
    it('is null when the newest response is an accept', () => {
        expect(
            declineNoteOf('rejected', { decision: 'accepted', reason: '', created: CREATED })
        ).toBeNull()
    })

    it('reads the day of created in the local time zone (east of UTC)', () => {
        process.env.TZ = 'Asia/Tokyo'
        // The zone change reaches Date in this worker (else the test proves nothing).
        expect(new Date('2026-11-11T16:42:10Z').getDate()).toBe(12)
        expect(declineNoteOf('rejected', DECLINE)?.date).toBe('Nov 12, 2026')
    })

    it('reads the day of created in the local time zone (west of UTC)', () => {
        process.env.TZ = 'America/Los_Angeles'
        expect(new Date('2026-11-12T03:00:00Z').getDate()).toBe(11)
        expect(
            declineNoteOf('rejected', { ...DECLINE, created: '2026-11-12 03:00:00.000Z' })?.date
        ).toBe('Nov 11, 2026')
    })
})
