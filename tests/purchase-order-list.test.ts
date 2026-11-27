import {
    BasicIndex,
    createCollection,
    createLiveQueryCollection,
    eq,
    localOnlyCollectionOptions,
    type Ref,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import {
    chipClause,
    chipRuns,
    compareListRows,
    type DocumentListRow,
    emptyTexts,
    LIST_COLUMNS,
    listColumn,
    listControls,
    sortField,
    tableMinWidthFor,
} from '../tinycld/books/lib/document-list'
import { cardLines, cellText } from '../tinycld/books/lib/document-list-cells'
import { PURCHASE_TABS, purchaseTabOf } from '../tinycld/books/lib/purchase-lists'
import {
    PURCHASE_ORDER_BILLS,
    PURCHASE_ORDER_IDS,
    PURCHASE_ORDER_LINES,
    PURCHASE_ORDER_TODAY,
    PURCHASE_ORDERS,
} from '../tinycld/books/lib/purchase-orders-fixture'
import { formatDay } from '../tinycld/books/lib/register-range'
import { VENDORS } from '../tinycld/books/lib/vendor-form-fixture'
import { purchaseOrderRow } from '../tinycld/books/lib/vendor-transactions'

// The Purchase orders tab of the Expenses area (purchase order spec §3.9): its columns, its
// width rule, its chips and their clauses, its sort keys with Open, its cards and its empty
// texts, over the five seeded orders of lib/purchase-orders-fixture.ts.

const TAB = purchaseTabOf('purchase-orders')
const IDS = PURCHASE_ORDER_IDS

type Order = (typeof PURCHASE_ORDERS)[number]

function orderOf(id: string): Order {
    const order = PURCHASE_ORDERS.find(row => row.id === id)
    if (!order) throw new Error(`no fixture order ${id}`)
    return order
}

function vendorName(id: string): string {
    const vendor = VENDORS.find(row => row.id === id)
    if (!vendor) throw new Error(`no fixture vendor ${id}`)
    return vendor.display_name
}

// An order as the Purchase orders tab lists it: the vendor row (`purchaseOrderRow`, whose
// badge reads the order's lines) with the list's fields. Open is the order's stored
// `open_amount`, in the row's `balance` (the open balance of the row, as a bill's).
function listRowOf(order: Order): DocumentListRow {
    const lines = PURCHASE_ORDER_LINES.filter(line => line.purchase_order === order.id)
    return {
        ...purchaseOrderRow(order, lines),
        sequence: order.sequence,
        partyId: order.vendor,
        partyName: vendorName(order.vendor),
        memo: order.memo,
        reference: '',
        expires: '',
        balance: order.open_amount,
        entry: '',
        convertedInvoice: '',
        recordStatus: order.status,
        category: { kind: 'none' },
        email: order.email,
        hasBills: PURCHASE_ORDER_BILLS.some(bill => bill.purchase_order === order.id),
    }
}

function rowOf(id: string): DocumentListRow {
    return listRowOf(orderOf(id))
}

type Clause = ReturnType<typeof eq>

function storeOf<T extends { id: string }>(rows: readonly T[]) {
    return createCollection(
        localOnlyCollectionOptions({
            id: `purchase-order-list-${Math.random()}`,
            getKey: (row: T) => row.id,
            initialData: [...rows],
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        })
    )
}

// The fixture orders the chip's clause keeps, evaluated by TanStack DB as the list query
// puts it in its `where` (no clause keeps every order).
async function keptBy(chipId: string): Promise<string[]> {
    const live = createLiveQueryCollection({
        query: q =>
            q.from({ row: storeOf(PURCHASE_ORDERS) }).where(({ row }) => {
                const clause: Clause | undefined = chipClause(
                    TAB,
                    chipId,
                    'purchase_order',
                    row as unknown as Ref<{ id: string; status: string }>,
                    PURCHASE_ORDER_TODAY
                )
                return clause ?? eq(1, 1)
            }),
        startSync: true,
    })
    await live.preload()
    return live.toArray.map(row => (row as { id: string }).id).sort()
}

describe('the Purchase orders tab', () => {
    it('comes right after Bills in the Expenses tabs', () => {
        const keys = PURCHASE_TABS.map(tab => tab.key)
        expect(keys.indexOf('purchase-orders')).toBe(keys.indexOf('bills') + 1)
    })

    it('lists purchase orders at books/purchase-orders, with "New purchase order"', () => {
        expect(TAB).toMatchObject({
            key: 'purchase-orders',
            area: 'purchases',
            label: 'Purchase orders',
            path: 'books/purchase-orders',
            noun: 'purchase orders',
            newLabel: 'New purchase order',
            newHref: 'books/purchase-orders/new',
            isSigned: false,
        })
        expect([...TAB.kinds]).toEqual(['purchase_order'])
    })

    it('has the columns Date, No., Vendor, Open, Total, Status', () => {
        expect([...TAB.columns]).toEqual(['date', 'number', 'vendor', 'open', 'total', 'status'])
        expect(TAB.columns.map(key => LIST_COLUMNS[key].label)).toEqual([
            'Date',
            'No.',
            'Vendor',
            'Open',
            'Total',
            'Status',
        ])
    })

    it('draws Open as a right-aligned column of at least 100 px that sorts by Open', () => {
        expect(listColumn('open', 'purchases')).toMatchObject({
            label: 'Open',
            minWidth: 100,
            align: 'right',
            sortKey: 'open',
        })
    })

    // Spec §3.9: "by the list's own minimum-width rule (`useTableMinWidth`)": a table in the
    // 956 px list of a 1280 window, cards in the 529 px list of a 768 window.
    it("is a table at 1280 and cards at 768 by the list's own minimum width", () => {
        for (const canWrite of [true, false]) {
            const controls = listControls(canWrite, 'table')
            const cells = TAB.columns.reduce(
                (sum, key) => sum + listColumn(key, 'purchases').minWidth,
                0
            )
            const width = tableMinWidthFor(TAB, controls)
            const edges = (controls.showTicks ? 44 : 16) + (controls.showRowMenus ? 44 : 0) + 8
            expect(width).toBe(cells + edges)
            expect(width).toBeLessThanOrEqual(956)
            expect(width).toBeGreaterThan(529)
        }
    })

    it('has the chips All, Open and Closed', () => {
        expect([...TAB.chips]).toEqual([
            { id: 'all', label: 'All' },
            { id: 'open', label: 'Open' },
            { id: 'closed', label: 'Closed' },
        ])
        for (const chip of ['all', 'open', 'closed']) {
            expect(chipRuns(TAB, chip, 'purchase_order'), chip).toBe(true)
        }
        expect(chipRuns(TAB, 'draft', 'purchase_order')).toBe(false)
    })

    it('sorts by the base keys and Open', () => {
        expect([...TAB.sortKeys].sort()).toEqual(['amount', 'date', 'number', 'open'])
    })
})

describe('the Purchase orders chips', () => {
    it('All keeps every order and gives no clause', async () => {
        expect(
            chipClause(
                TAB,
                'all',
                'purchase_order',
                {} as Ref<{ id: string }>,
                PURCHASE_ORDER_TODAY
            )
        ).toBeUndefined()
        expect(await keptBy('all')).toEqual(PURCHASE_ORDERS.map(row => row.id).sort())
    })

    it('Open keeps the open orders, partly received ones included', async () => {
        expect(await keptBy('open')).toEqual([IDS.partly, IDS.open, IDS.draftBill].sort())
    })

    it('Closed keeps the orders closed as received and by hand', async () => {
        expect(await keptBy('closed')).toEqual([IDS.closedReceived, IDS.closedManual].sort())
    })
})

describe('the Purchase orders sort', () => {
    it('sorts each key on its server field, Open on open_amount', () => {
        expect(sortField('purchase_order', 'date')).toBe('date')
        expect(sortField('purchase_order', 'number')).toBe('sequence')
        expect(sortField('purchase_order', 'amount')).toBe('total')
        expect(sortField('purchase_order', 'open')).toBe('open_amount')
    })

    it('orders the window by Open, largest first, then newest created', () => {
        const sorted = PURCHASE_ORDERS.map(listRowOf).sort(
            compareListRows({ key: 'open', isAscending: false })
        )
        expect(sorted.map(row => row.number)).toEqual(['1003', '1004', '1005', '1002', '1001'])
    })
})

describe('the Purchase orders cells and cards', () => {
    it("shows the order's Open and Total, and — for a closed order's Open", () => {
        expect(cellText(rowOf(IDS.partly), 'open', TAB, 'USD')).toBe('$2,947.00')
        expect(cellText(rowOf(IDS.partly), 'total', TAB, 'USD')).toBe('$4,544.20')
        expect(cellText(rowOf(IDS.closedManual), 'open', TAB, 'USD')).toBe('—')
        expect(cellText(rowOf(IDS.closedManual), 'total', TAB, 'USD')).toBe('$344.00')
    })

    it('gives the status cell the badge: Open, Partly received or Closed', () => {
        expect(cellText(rowOf(IDS.open), 'status', TAB, 'USD')).toBe('Open')
        expect(cellText(rowOf(IDS.partly), 'status', TAB, 'USD')).toBe('Partly received')
        expect(cellText(rowOf(IDS.closedReceived), 'status', TAB, 'USD')).toBe('Closed')
    })

    it('draws a card as vendor and total, then "1004 · <date>", then "Open <amount>"', () => {
        const order = orderOf(IDS.open)
        expect(cardLines(rowOf(IDS.open), TAB, 'USD')).toEqual({
            title: 'Office Supply World',
            amount: '$1,577.40',
            detail: `1004 · ${formatDay(order.date)}`,
            open: 'Open $1,577.40',
        })
    })

    it('draws no Open line on the card of an order with nothing open', () => {
        const lines = cardLines(rowOf(IDS.closedReceived), TAB, 'USD')
        expect(lines.open).toBe('')
        expect(lines.title).toBe('Summit IT Services')
        expect(lines.detail).toBe(`1001 · ${formatDay(orderOf(IDS.closedReceived).date)}`)
    })
})

describe('the Purchase orders empty texts', () => {
    it('reads "No purchase orders yet" and "No purchase orders match"', () => {
        expect(emptyTexts(TAB)).toEqual({
            yet: 'No purchase orders yet',
            match: 'No purchase orders match',
        })
    })
})
