import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { binMessage } from '../tinycld/books/lib/bin-messages'
import { BIN_IDS, BINS, NO_BIN, NO_BIN_LABEL } from '../tinycld/books/lib/inventory-adjust-fixture'
import { type MoveStockValues, moveStockSchema } from '../tinycld/books/lib/move-stock-schema'
import { fillPaymentText } from '../tinycld/books/lib/payment-texts'

// The Move stock dialog's one zod schema (inventory-adjust spec §3.8): From and To differ,
// Quantity is above 0 with at most 2 decimals and not above what the From bin holds, Memo
// is at most 200 characters. The texts are the server's (server/testdata/bin_messages.json,
// which server/bins_test.go formats for the transfer guard too).

const AISLE_3 = BIN_IDS.aisle3
const FRONT_COUNTER = BIN_IDS.frontCounter

// What each From bin holds of the item.
const HELD: Record<string, number> = { [AISLE_3]: 12, [FRONT_COUNTER]: 5, [NO_BIN]: 3 }

function held(bin: string): number {
    return HELD[bin] ?? 0
}

function nameOf(bin: string): string {
    if (bin === NO_BIN) return NO_BIN_LABEL
    const row = BINS.find(candidate => candidate.id === bin)
    if (!row) throw new Error(`no fixture bin ${bin}`)
    return row.name
}

const schema = moveStockSchema(held, nameOf)

const VALID: MoveStockValues = { from: AISLE_3, to: FRONT_COUNTER, quantity: 4, memo: '' }

type Issue = { path: string; message: string }

function issuesOf(values: MoveStockValues): Issue[] {
    const result = schema.safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }))
}

function serverText(key: string): string {
    const raw = readFileSync(
        join(__dirname, '..', 'server', 'testdata', 'bin_messages.json'),
        'utf8'
    )
    const texts = JSON.parse(raw) as Record<string, string>
    const text = texts[key]
    if (text === undefined) throw new Error(`bin_messages.json has no ${key}`)
    return text
}

describe('moveStockSchema', () => {
    it('accepts a move of part of what the From bin holds', () => {
        expect(issuesOf(VALID)).toEqual([])
        expect(issuesOf({ ...VALID, quantity: 12, memo: 'All of it' })).toEqual([])
    })

    it('refuses the same bin as From and To with the sameBins text', () => {
        const issues = issuesOf({ ...VALID, to: AISLE_3 })
        expect(issues.map(issue => issue.message)).toContain(binMessage('sameBins'))
        expect(binMessage('sameBins')).toBe(serverText('sameBins'))
    })

    it('refuses No bin as both From and To', () => {
        const issues = issuesOf({ ...VALID, from: NO_BIN, to: NO_BIN, quantity: 1 })
        expect(issues.map(issue => issue.message)).toContain(binMessage('sameBins'))
    })

    it.each([0, -1, 1.234])('refuses the quantity %d', quantity => {
        const issues = issuesOf({ ...VALID, quantity })
        expect(issues.length).toBeGreaterThan(0)
        expect(issues.every(issue => issue.path === 'quantity')).toBe(true)
    })

    it('accepts a quantity with 2 decimals', () => {
        expect(issuesOf({ ...VALID, quantity: 1.25 })).toEqual([])
    })

    it('refuses more than the From bin holds with the server holds text', () => {
        const issues = issuesOf({ ...VALID, quantity: 13 })
        const expected = binMessage('holds', nameOf(AISLE_3), '12', '12')
        expect(expected).toBe(fillPaymentText(serverText('holds'), nameOf(AISLE_3), '12', '12'))
        expect(expected).toBe('Aisle 3, shelf B holds 12. Move 12 or fewer.')
        expect(issues).toEqual([{ path: 'quantity', message: expected }])
    })

    it('reads what the chosen From bin holds, not another bin', () => {
        const issues = issuesOf({ ...VALID, from: FRONT_COUNTER, to: AISLE_3, quantity: 6 })
        expect(issues).toEqual([
            {
                path: 'quantity',
                message: binMessage('holds', nameOf(FRONT_COUNTER), '5', '5'),
            },
        ])
        expect(issuesOf({ ...VALID, from: FRONT_COUNTER, to: AISLE_3, quantity: 5 })).toEqual([])
    })

    it('accepts No bin as From and as To', () => {
        expect(issuesOf({ ...VALID, from: NO_BIN, to: AISLE_3, quantity: 3 })).toEqual([])
        expect(issuesOf({ ...VALID, from: AISLE_3, to: NO_BIN, quantity: 12 })).toEqual([])
        expect(issuesOf({ ...VALID, from: NO_BIN, to: AISLE_3, quantity: 4 })).toEqual([
            { path: 'quantity', message: binMessage('holds', NO_BIN_LABEL, '3', '3') },
        ])
    })

    it('refuses a memo of 201 characters and keeps one of 200', () => {
        expect(issuesOf({ ...VALID, memo: 'm'.repeat(201) }).map(issue => issue.path)).toEqual([
            'memo',
        ])
        expect(issuesOf({ ...VALID, memo: 'm'.repeat(200) })).toEqual([])
    })
})
