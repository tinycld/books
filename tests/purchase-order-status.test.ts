import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    isOrderLineOpen,
    isPartlyReceived,
    orderHasOpenLine,
    orderLineOpenAmount,
    orderLineOpenQuantity,
    purchaseOrderBadge,
} from '../tinycld/books/lib/purchase-order-status'
import {
    PURCHASE_ORDER_IDS,
    PURCHASE_ORDER_LINES,
    PURCHASE_ORDERS,
} from '../tinycld/books/lib/purchase-orders-fixture'

// Purchase order spec §3.8, §4: the open math of a line, one case table that this test and
// server/purchase_order_receipts_test.go both run, so the client and the server cannot
// drift.
type OpenCase = {
    name: string
    kind: 'item' | 'account'
    status: 'open' | 'closed'
    quantity: number
    rate: number
    amount: number
    received: number
    billed: number
    open_quantity: number
    open_amount: number
    line_open: boolean
    partly_received: boolean
}

const CASES: OpenCase[] = JSON.parse(
    readFileSync(
        join(__dirname, '..', 'server', 'testdata', 'purchase_order_open_cases.json'),
        'utf8'
    )
)

describe('the shared open cases', () => {
    it('holds rows of both kinds and both statuses', () => {
        expect(CASES.some(row => row.kind === 'item')).toBe(true)
        expect(CASES.some(row => row.kind === 'account')).toBe(true)
        expect(CASES.some(row => row.status === 'closed')).toBe(true)
    })

    for (const row of CASES) {
        it(`${row.name}: open quantity, open amount, line open and partly received`, () => {
            expect(
                orderLineOpenQuantity({
                    kind: row.kind,
                    quantity: row.quantity,
                    received: row.received,
                })
            ).toBe(row.open_quantity)
            expect(
                orderLineOpenAmount({
                    kind: row.kind,
                    quantity: row.quantity,
                    rate: row.rate,
                    amount: row.amount,
                    received: row.received,
                    billed: row.billed,
                })
            ).toBe(row.open_amount)
            expect(
                isOrderLineOpen({
                    kind: row.kind,
                    open_quantity: row.open_quantity,
                    open_amount: row.open_amount,
                })
            ).toBe(row.line_open)
            expect(
                isPartlyReceived({ status: row.status }, [
                    { received: row.received, billed: row.billed },
                ])
            ).toBe(row.partly_received)
        })
    }
})

describe('orderHasOpenLine', () => {
    it('is true while one line is open and false when none is', () => {
        const open = CASES.filter(row => row.line_open)
        const done = CASES.filter(row => !row.line_open)
        expect(open.length).toBeGreaterThan(0)
        expect(done.length).toBeGreaterThan(0)
        expect(orderHasOpenLine([...done, open[0] as OpenCase])).toBe(true)
        expect(orderHasOpenLine(done)).toBe(false)
        expect(orderHasOpenLine([])).toBe(false)
    })
})

function linesOf(orderId: string) {
    return PURCHASE_ORDER_LINES.filter(line => line.purchase_order === orderId)
}

function orderOf(id: string) {
    const row = PURCHASE_ORDERS.find(order => order.id === id)
    if (!row) throw new Error(`no fixture order ${id}`)
    return row
}

// The order badge (checkpoint 1 brief): Open (info), Partly received (warning), Closed (muted).
describe('purchaseOrderBadge of each fixture order', () => {
    const CASES_BY_ORDER = [
        { id: PURCHASE_ORDER_IDS.closedReceived, label: 'Closed', tone: 'muted' },
        { id: PURCHASE_ORDER_IDS.closedManual, label: 'Closed', tone: 'muted' },
        { id: PURCHASE_ORDER_IDS.partly, label: 'Partly received', tone: 'warning' },
        { id: PURCHASE_ORDER_IDS.open, label: 'Open', tone: 'info' },
        { id: PURCHASE_ORDER_IDS.draftBill, label: 'Open', tone: 'info' },
    ] as const

    for (const { id, label, tone } of CASES_BY_ORDER) {
        it(`${id} reads ${label} (${tone})`, () => {
            expect(purchaseOrderBadge(orderOf(id), linesOf(id))).toEqual({ label, tone })
        })
    }
})
