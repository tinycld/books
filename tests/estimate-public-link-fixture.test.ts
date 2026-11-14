import { describe, expect, expectTypeOf, it } from 'vitest'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import { ESTIMATES } from '../tinycld/books/lib/estimate-form-fixture'
import {
    DECLINE_ESTIMATE_LINES,
    DECLINE_ESTIMATES,
    DECLINE_RESPONSES,
    type EstimatePublicRow,
    type EstimateResponseRecord,
    PUBLIC_ROWS,
    PUBLIC_TODAY,
    UNKNOWN_TOKEN,
} from '../tinycld/books/lib/estimate-public-link-fixture'
import type {
    BooksEstimatePublic,
    BooksEstimateResponses,
    BooksEstimates,
} from '../tinycld/books/types'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const publicRows = Object.values(PUBLIC_ROWS)

function linesOf(estimateId: string) {
    return DECLINE_ESTIMATE_LINES.filter(line => line.estimate === estimateId).sort(
        (a, b) => a.position - b.position
    )
}

describe('generated estimate public link types', () => {
    it('the generated types accept the fixture', () => {
        // tsc fails here until the migration and the generated types exist.
        const pending = PUBLIC_ROWS.pending satisfies BooksEstimatePublic
        const responses = DECLINE_RESPONSES satisfies BooksEstimateResponses[]
        expect(pending.status).toBe('pending')
        expect(responses.length).toBe(2)
        expectTypeOf<EstimatePublicRow>().toEqualTypeOf<BooksEstimatePublic>()
        expectTypeOf<EstimateResponseRecord>().toEqualTypeOf<BooksEstimateResponses>()
        const token: BooksEstimates['public_token'] = PUBLIC_ROWS.pending.token
        expect(token).toBe(PUBLIC_ROWS.pending.token)
    })
})

describe('PUBLIC_ROWS', () => {
    it('every token and UNKNOWN_TOKEN is 43 URL-safe characters, and all differ', () => {
        const tokens = [...publicRows.map(row => row.token), UNKNOWN_TOKEN]
        expect(tokens.filter(token => !TOKEN_PATTERN.test(token))).toEqual([])
        expect(new Set(tokens).size).toBe(tokens.length)
    })

    it('holds each outcome of the public page', () => {
        expect(
            publicRows.some(
                row =>
                    row.status === 'pending' &&
                    row.expiration_date !== '' &&
                    row.expiration_date > PUBLIC_TODAY
            ),
            'a pending row expiring after today'
        ).toBe(true)
        expect(
            publicRows.some(
                row =>
                    row.status === 'pending' &&
                    row.expiration_date !== '' &&
                    row.expiration_date < PUBLIC_TODAY
            ),
            'a pending row already expired'
        ).toBe(true)
        expect(
            publicRows.some(row => row.status === 'accepted' && row.accepted_by !== ''),
            'an accepted row with Accepted by'
        ).toBe(true)
        expect(
            publicRows.some(row => row.status === 'rejected'),
            'a rejected row'
        ).toBe(true)
        expect(
            publicRows.some(row => row.status === 'closed'),
            'a closed row'
        ).toBe(true)
    })
})

describe('estimate tokens', () => {
    it('every seeded estimate carries its own 43-character public token', () => {
        const tokens = [...ESTIMATES, ...DECLINE_ESTIMATES].map(row => row.public_token)
        expect(tokens.filter(token => !TOKEN_PATTERN.test(token))).toEqual([])
        expect(new Set(tokens).size).toBe(tokens.length)
    })
})

describe('DECLINE_ESTIMATES', () => {
    it('subtotal and total equal documentTotals of the lines', () => {
        for (const row of DECLINE_ESTIMATES) {
            const lines = linesOf(row.id)
            expect(lines.length, row.id).toBeGreaterThan(0)
            const totals = documentTotals(
                lines.map(line => ({
                    kind: line.kind,
                    quantity: line.quantity,
                    rate: line.rate,
                    percentPpm: line.percent_ppm,
                    taxable: line.taxable,
                })),
                null
            )
            expect({ subtotal: row.subtotal, total: row.total }, row.id).toEqual({
                subtotal: totals.subtotal,
                total: totals.total,
            })
        }
    })

    it('numbers them 1006 and 1007, after the highest ESTIMATES number', () => {
        const highest = Math.max(...ESTIMATES.map(row => Number(row.number)))
        expect(highest).toBe(1005)
        expect(DECLINE_ESTIMATES.map(row => row.number)).toEqual(['1006', '1007'])
    })

    it('has one decline reason over several lines and one empty reason', () => {
        expect(DECLINE_RESPONSES.every(response => response.decision === 'declined')).toBe(true)
        expect(DECLINE_RESPONSES.some(response => response.reason.includes('\n'))).toBe(true)
        expect(DECLINE_RESPONSES.some(response => response.reason === '')).toBe(true)
    })

    it('every id is 15 characters', () => {
        const ids = [
            ...DECLINE_ESTIMATES.map(row => row.id),
            ...DECLINE_ESTIMATE_LINES.map(row => row.id),
            ...DECLINE_RESPONSES.map(row => row.id),
            ...publicRows.map(row => row.id),
        ]
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })
})
