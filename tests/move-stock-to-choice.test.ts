import { describe, expect, it } from 'vitest'
import { BIN_IDS, NO_BIN } from '../tinycld/books/lib/inventory-adjust-fixture'
import { MOVE_STOCK_TEXTS, moveStockSchema } from '../tinycld/books/lib/move-stock-schema'

// Move stock's To starts with no choice (null) when From is No bin, and goes back to no
// choice when From becomes the To bin (hooks/useMoveStock.ts): the schema refuses a null To
// on To, and still checks the quantity.

const AISLE_3 = BIN_IDS.aisle3

const schema = moveStockSchema(
    bin => (bin === NO_BIN ? 3 : 0),
    bin => (bin === NO_BIN ? 'No bin' : bin)
)

function issuesOf(values: Parameters<typeof schema.safeParse>[0]) {
    const result = schema.safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }))
}

describe('moveStockSchema To with no choice', () => {
    it('refuses a null To on To', () => {
        expect(issuesOf({ from: NO_BIN, to: null, quantity: 1, memo: '' })).toEqual([
            { path: 'to', message: MOVE_STOCK_TEXTS.toRequired },
        ])
    })

    it('checks the quantity with a null To too', () => {
        const paths = issuesOf({ from: NO_BIN, to: null, quantity: 4, memo: '' }).map(
            issue => issue.path
        )
        expect(paths).toEqual(['to', 'quantity'])
    })

    it('passes a chosen To', () => {
        expect(issuesOf({ from: NO_BIN, to: AISLE_3, quantity: 1, memo: '' })).toEqual([])
    })
})
