import * as zodSchemas from '@tinycld/core/types/pbZodSchema'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { OPEN_PURCHASE_ORDERS_FILTER_PICK } from '../tinycld/books/lib/open-purchase-orders-fixture'
import { orderLineOpenAmount } from '../tinycld/books/lib/purchase-order-status'
import {
    PURCHASE_ORDER_IDS,
    PURCHASE_ORDER_LINES,
    PURCHASE_ORDERS,
} from '../tinycld/books/lib/purchase-orders-fixture'
import { VENDORS } from '../tinycld/books/lib/vendor-form-fixture'
import type { BooksPurchaseOrderLines, BooksPurchaseOrders } from '../tinycld/books/types'

// The purchase order fixture (purchase order spec §4) against the generated schema: every
// row is a row of its collection, and its open values are the server's open formula.

// The fields the generated zod schema of a collection lists (from the migrations):
// `books_purchase_orders` → `booksPurchaseOrdersSchema`.
function schemaFields(collection: string): string[] {
    const name = `${collection.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}Schema`
    const schema = (zodSchemas as Record<string, unknown>)[name]
    if (!schema || typeof schema !== 'object' || !('shape' in schema)) {
        throw new Error(`no generated schema ${name} for ${collection}`)
    }
    return Object.keys(schema.shape as object).sort()
}

describe('the purchase order fixture against the generated types', () => {
    it('types every row as its generated record type', () => {
        expectTypeOf(PURCHASE_ORDERS).toMatchTypeOf<BooksPurchaseOrders[]>()
        expectTypeOf(PURCHASE_ORDER_LINES).toMatchTypeOf<
            (Omit<BooksPurchaseOrderLines, 'account'> & { account_number: string })[]
        >()
    })

    it('names only fields of the generated schemas', () => {
        const orderFields = schemaFields('books_purchase_orders')
        for (const row of PURCHASE_ORDERS) {
            for (const key of Object.keys(row))
                expect(orderFields, `${row.id} ${key}`).toContain(key)
        }
        const lineFields = schemaFields('books_purchase_order_lines')
        expect(lineFields).toContain('account')
        for (const row of PURCHASE_ORDER_LINES) {
            for (const key of Object.keys(row)) {
                if (key === 'account_number') continue
                expect(lineFields, `${row.id} ${key}`).toContain(key)
            }
        }
    })
})

describe('the purchase order fixture rows', () => {
    it('holds five orders numbered 1001 to 1005 in seed order', () => {
        expect(PURCHASE_ORDERS.map(row => row.number)).toEqual([
            '1001',
            '1002',
            '1003',
            '1004',
            '1005',
        ])
    })

    // Order 1003 is Lumen & Ledger Coworking's, so the purchase list specs that count
    // Northwest Paper Co.'s rows keep their counts.
    it("gives order 1003 to Lumen & Ledger Coworking and picks that vendor in the report's filter", () => {
        const partly = PURCHASE_ORDERS.find(row => row.id === PURCHASE_ORDER_IDS.partly)
        expect(partly?.number).toBe('1003')
        expect(partly?.vendor).toBe('vendlumenledgr1')
        expect(VENDORS.find(row => row.id === 'vendlumenledgr1')?.display_name).toBe(
            'Lumen & Ledger Coworking'
        )
        expect(OPEN_PURCHASE_ORDERS_FILTER_PICK).toEqual(['Lumen & Ledger Coworking'])
    })

    // The open formula (spec §3.8): open quantity = max(Qty − received, 0); a product
    // line's open amount = round(open quantity × rate), an account line's = max(amount −
    // billed, 0); the header's open amount is the sum of its lines' while open, 0 closed.
    it("holds the server's open values on every line and header", () => {
        for (const line of PURCHASE_ORDER_LINES) {
            const openQuantity =
                line.kind === 'item' ? Math.max(line.quantity - line.received, 0) : 0
            expect(line.open_quantity, line.id).toBe(openQuantity)
            expect(orderLineOpenAmount(line), line.id).toBe(line.open_amount)
        }
        for (const order of PURCHASE_ORDERS) {
            const own = PURCHASE_ORDER_LINES.filter(line => line.purchase_order === order.id)
            const open = own.reduce((sum, line) => sum + line.open_amount, 0)
            expect(order.open_amount, order.id).toBe(order.status === 'open' ? open : 0)
            expect(order.total, order.id).toBe(own.reduce((sum, line) => sum + line.amount, 0))
        }
    })
})
