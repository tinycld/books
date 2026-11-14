import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    BILL_ACCOUNT_TYPES,
    BILL_LINES,
    BILL_SEED_IDS,
    BILLS,
    type BillLineFixtureRecord,
    type BillLineRecord,
    type BillRecord,
    type PurchaseLines,
} from '../tinycld/books/lib/bill-form-fixture'
import { PRODUCTS } from '../tinycld/books/lib/products-services-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import type { BooksBillLines, BooksBills, BooksSettings } from '../tinycld/books/types'

function linesOf(billId: string) {
    return BILL_LINES.filter(line => line.bill === billId)
}

describe('generated bill types', () => {
    it('the fixture types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<BillRecord>().toEqualTypeOf<BooksBills>()
        expectTypeOf<BillLineRecord>().toEqualTypeOf<BooksBillLines>()
        expectTypeOf<BillLineFixtureRecord>().toEqualTypeOf<
            Omit<BooksBillLines, 'account'> & { account_number: string }
        >()
        expectTypeOf<BooksSettings['purchase_lines']>().toEqualTypeOf<PurchaseLines>()
    })
})

describe('BILLS', () => {
    it('gives every bill a total equal to the sum of its lines, with no tax', () => {
        for (const row of BILLS) {
            const sum = linesOf(row.id).reduce((total, line) => total + line.amount, 0)
            expect({ subtotal: row.subtotal, total: row.total }, row.id).toEqual({
                subtotal: sum,
                total: sum,
            })
        }
    })

    it('every id is 15 characters', () => {
        const ids = [...BILLS.map(row => row.id), ...BILL_LINES.map(row => row.id)]
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('dates every bill the seed posts after 2026-06-30', () => {
        const posted = BILL_SEED_IDS.map(id => BILLS.find(row => row.id === id)).filter(
            row => row !== undefined && row.status !== 'draft'
        )
        expect(posted.length).toBe(3)
        expect(posted.filter(row => !(row && row.date > '2026-06-30')).map(row => row?.id)).toEqual(
            []
        )
    })

    it('puts every account line on a seed account the bill Account picker lists', () => {
        const typeOf = new Map(SEED_ACCOUNTS.map(account => [account.number, account.type]))
        const wrong = BILL_LINES.filter(line => line.kind === 'account')
            .filter(line => !BILL_ACCOUNT_TYPES.has(typeOf.get(line.account_number) ?? ''))
            .map(line => `${line.id} ${line.account_number}`)
        expect(wrong).toEqual([])
    })

    it('names on every product line a product with purchasing on', () => {
        const purchased = new Set(PRODUCTS.filter(row => row.purchases).map(row => row.id))
        const wrong = BILL_LINES.filter(line => line.kind === 'item')
            .filter(line => !purchased.has(line.product))
            .map(line => line.id)
        expect(wrong).toEqual([])
    })

    it('holds each case of spec §4', () => {
        const draftOnPetty = BILLS.find(
            row =>
                row.status === 'draft' &&
                linesOf(row.id).some(
                    line => line.kind === 'account' && line.account_number === '6900'
                )
        )
        expect(draftOnPetty, 'a draft bill with an account line on 6900').toBeDefined()

        const bothKinds = BILLS.find(row => {
            const lines = linesOf(row.id)
            return (
                row.status === 'posted' &&
                lines.some(line => line.kind === 'item') &&
                lines.some(line => line.kind === 'account' && line.amount < 0)
            )
        })
        expect(
            bothKinds,
            'a posted bill with product lines and a negative account line'
        ).toBeDefined()

        const oneAccountLine = BILLS.find(row => {
            const lines = linesOf(row.id)
            return row.status === 'posted' && lines.length === 1 && lines[0].kind === 'account'
        })
        expect(oneAccountLine, 'a posted bill with one account line').toBeDefined()

        expect(
            BILLS.some(row => row.status === 'void'),
            'a void bill'
        ).toBe(true)
    })
})
