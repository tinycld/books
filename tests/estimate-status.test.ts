import { describe, expect, it } from 'vitest'
import {
    acceptanceShown,
    ESTIMATE_STATUS_OPTIONS,
    ESTIMATE_STATUSES,
    isExpired,
} from '../tinycld/books/lib/estimate-status'

const TODAY = '2026-11-12'

describe('ESTIMATE_STATUS_OPTIONS', () => {
    // Spec §3.3: only the server sets Closed, so the select never offers it.
    it('offers Pending, Accepted and Rejected in that order, never Closed', () => {
        expect(ESTIMATE_STATUS_OPTIONS.map(option => option.value)).toEqual([
            'pending',
            'accepted',
            'rejected',
        ])
        expect(ESTIMATE_STATUSES).toContain('closed')
    })
})

describe('isExpired', () => {
    it('is true only for a Pending or Accepted estimate whose expiration date is before today', () => {
        const cases: [string, string, boolean][] = [
            ['pending', '2026-10-31', true],
            ['accepted', '2026-11-11', true],
            ['pending', '2026-11-12', false],
            ['pending', '', false],
            ['rejected', '2026-10-31', false],
            ['closed', '2026-10-31', false],
        ]
        for (const [status, expiration_date, want] of cases) {
            expect(
                isExpired({ status, expiration_date }, TODAY),
                `${status} ${expiration_date}`
            ).toBe(want)
        }
    })
})

describe('acceptanceShown', () => {
    it('shows the acceptance fields for Accepted only', () => {
        expect(acceptanceShown('accepted')).toBe(true)
        for (const status of ['pending', 'rejected', 'closed']) {
            expect(acceptanceShown(status), status).toBe(false)
        }
    })
})
