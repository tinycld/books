import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OWN_OVERRIDE } from '../tinycld/books/lib/books-settings-fixture'
import {
    expiryFrom,
    formatExpiry,
    ownOverrideLine,
    splitOverrides,
} from '../tinycld/books/lib/overrides'

describe('splitOverrides', () => {
    const now = new Date('2026-10-24T12:00:00.000Z')
    const rows = [
        { id: 'a', expires_at: '2026-10-24 12:00:01.000Z' },
        { id: 'b', expires_at: '2026-10-24 12:00:00.000Z' },
        { id: 'c', expires_at: '2026-11-01 00:00:00.000Z' },
        { id: 'd', expires_at: '2026-10-01 00:00:00.000Z' },
    ]

    it('splits by expires_at alone and keeps input order', () => {
        const { active, past } = splitOverrides(rows, now)
        expect(active.map(r => r.id)).toEqual(['a', 'c'])
        expect(past.map(r => r.id)).toEqual(['b', 'd'])
    })
})

describe('expiryFrom', () => {
    const now = new Date('2026-10-24T10:00:00.000Z')

    it('adds the preset length in PocketBase datetime format', () => {
        expect(expiryFrom('24h', now)).toBe('2026-10-25 10:00:00.000Z')
        expect(expiryFrom('7d', now)).toBe('2026-10-31 10:00:00.000Z')
        expect(expiryFrom('30d', now)).toBe('2026-11-23 10:00:00.000Z')
    })
})

const previousTz = process.env.TZ

function useTimeZone(zone: string) {
    beforeEach(() => {
        process.env.TZ = zone
    })
    afterEach(() => {
        if (previousTz === undefined) delete process.env.TZ
        else process.env.TZ = previousTz
    })
}

describe('formatExpiry', () => {
    useTimeZone('UTC')

    it('formats in the viewer zone', () => {
        expect(formatExpiry('2026-11-03 17:00:00.000Z')).toBe('Nov 3, 2026, 5:00 PM')
    })
})

describe('ownOverrideLine', () => {
    describe('in UTC', () => {
        useTimeZone('UTC')

        it('reads the date and the reason', () => {
            expect(ownOverrideLine(OWN_OVERRIDE)).toBe(
                'You can post into the closed period until Nov 3, 2026 (reason: Year-end adjustments).'
            )
        })
    })

    describe('in America/Los_Angeles', () => {
        useTimeZone('America/Los_Angeles')

        it('uses the viewer-zone day, the same day formatExpiry shows', () => {
            const row = { expires_at: '2026-11-04 03:00:00.000Z', reason: 'Late close' }
            expect(formatExpiry(row.expires_at)).toContain('Nov 3, 2026')
            expect(ownOverrideLine(row)).toBe(
                'You can post into the closed period until Nov 3, 2026 (reason: Late close).'
            )
        })
    })
})
