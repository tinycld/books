import { describe, expect, it } from 'vitest'
import {
    emptyTexts,
    kindLabel,
    type ListKind,
    listControls,
    listDocumentHref,
    tableMinWidthFor,
    tabStateKey,
} from '../tinycld/books/lib/document-list'
import { areaOf, LIST_AREAS } from '../tinycld/books/lib/list-areas'
import { NEW_ACTIONS } from '../tinycld/books/lib/new-actions'
import {
    PURCHASE_NEW_ITEMS,
    PURCHASE_TABS,
    purchaseTabForKind,
    purchaseTabOf,
    vendorTransactionsTab,
} from '../tinycld/books/lib/purchase-lists'
import { salesTabOf } from '../tinycld/books/lib/sales-lists'

// The Expenses area's tabs (spec docs/specs/purchase-lists-design.md §2, §3 "Rows and
// columns", "Search and filters", "Sort"; checkpoint 1 Decisions).

const chips = (...labels: string[]) =>
    labels.map(label => ({ id: label.toLowerCase().replace(/ /g, '-'), label }))

// The spec's three tables (routes, columns, chips) and the sortable columns, per tab.
const EXPECTED_TABS = [
    {
        key: 'all',
        label: 'All purchases',
        path: 'books/purchases',
        kinds: ['bill', 'expense', 'bill_payment', 'vendor_credit', 'vendor_refund'],
        columns: ['date', 'type', 'number', 'vendor', 'category', 'amount', 'status'],
        chips: chips('All', 'Open', 'Overdue', 'Closed', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
        writerMinWidth: 912,
    },
    {
        key: 'bills',
        label: 'Bills',
        path: 'books/bills',
        kinds: ['bill'],
        columns: ['date', 'number', 'vendor', 'due', 'balance', 'total', 'status'],
        chips: chips('All', 'Open', 'Overdue', 'Paid', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount', 'due', 'balance'],
        writerMinWidth: 886,
    },
    {
        key: 'expenses',
        label: 'Expenses',
        path: 'books/expenses',
        kinds: ['expense'],
        columns: ['date', 'number', 'vendor', 'category', 'total', 'status'],
        chips: chips('All', 'Paid', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
        writerMinWidth: 792,
    },
    {
        key: 'bill-payments',
        label: 'Bill payments',
        path: 'books/bill-payments',
        kinds: ['bill_payment'],
        columns: ['date', 'number', 'vendor', 'reference', 'amount', 'status'],
        chips: chips('All', 'Paid', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
        writerMinWidth: 792,
    },
    {
        key: 'vendor-credits',
        label: 'Vendor credits',
        path: 'books/vendor-credits',
        kinds: ['vendor_credit'],
        columns: ['date', 'number', 'vendor', 'balance', 'total', 'status'],
        chips: chips('All', 'Unapplied', 'Closed', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount', 'balance'],
        writerMinWidth: 778,
    },
    {
        key: 'vendor-refunds',
        label: 'Vendor refunds',
        path: 'books/vendor-refunds',
        kinds: ['vendor_refund'],
        columns: ['date', 'number', 'vendor', 'reference', 'amount', 'status'],
        chips: chips('All', 'Received', 'Draft', 'Void'),
        sortKeys: ['date', 'number', 'amount'],
        writerMinWidth: 792,
    },
] as const

const EXPECTED_NEW_ITEMS = [
    { kind: 'bill', label: 'New bill', href: 'books/bills/new', idSuffix: 'bill' },
    { kind: 'bill_payment', label: 'Pay bills', href: 'books/pay-bills', idSuffix: 'pay-bills' },
    { kind: 'expense', label: 'New expense', href: 'books/expenses/new', idSuffix: 'expense' },
    {
        kind: 'vendor_credit',
        label: 'New vendor credit',
        href: 'books/vendor-credits/new',
        idSuffix: 'vendor-credit',
    },
    {
        kind: 'vendor_refund',
        label: 'New vendor refund',
        href: 'books/vendor-refunds/new',
        idSuffix: 'vendor-refund',
    },
] as const

describe('PURCHASE_TABS', () => {
    it('has the six tabs in tab order, all in the purchases area', () => {
        expect(PURCHASE_TABS.map(tab => tab.key)).toEqual(EXPECTED_TABS.map(tab => tab.key))
        expect(PURCHASE_TABS.map(tab => tab.area)).toEqual(EXPECTED_TABS.map(() => 'purchases'))
    })

    it.each(
        EXPECTED_TABS
    )('$label has its label, path, kinds, columns, chips and sort keys', expected => {
        const tab = purchaseTabOf(expected.key)
        expect(tab.label).toBe(expected.label)
        expect(tab.path).toBe(expected.path)
        expect([...tab.kinds]).toEqual([...expected.kinds])
        expect([...tab.columns]).toEqual([...expected.columns])
        expect([...tab.chips]).toEqual(expected.chips)
        expect([...tab.sortKeys].sort()).toEqual([...expected.sortKeys].sort())
    })

    it('makes only All purchases signed and gives only All purchases the New menu', () => {
        expect(PURCHASE_TABS.filter(tab => tab.isSigned).map(tab => tab.key)).toEqual(['all'])
        expect(PURCHASE_TABS.filter(tab => tab.newHref === null).map(tab => tab.key)).toEqual([
            'all',
        ])
        expect(purchaseTabOf('all').newLabel).toBe('New')
    })

    it("gives each kind tab its kind's New item as its New label and href", () => {
        for (const tab of PURCHASE_TABS.slice(1)) {
            const item = PURCHASE_NEW_ITEMS.find(entry => entry.kind === tab.kinds[0])
            expect(item, tab.key).toBeDefined()
            expect(tab.newLabel).toBe(item?.label)
            expect(tab.newHref).toBe(item?.href)
        }
    })

    it('finds the tab of each kind', () => {
        expect(purchaseTabForKind('bill').key).toBe('bills')
        expect(purchaseTabForKind('expense').key).toBe('expenses')
        expect(purchaseTabForKind('bill_payment').key).toBe('bill-payments')
        expect(purchaseTabForKind('vendor_credit').key).toBe('vendor-credits')
        expect(purchaseTabForKind('vendor_refund').key).toBe('vendor-refunds')
    })
})

describe('PURCHASE_NEW_ITEMS', () => {
    it('are the takesVendor entries of NEW_ACTIONS in their order, with the New labels', () => {
        const actions = NEW_ACTIONS.filter(action => action.takesVendor)
        expect(PURCHASE_NEW_ITEMS.map(item => item.href)).toEqual(actions.map(a => a.href))
        expect(PURCHASE_NEW_ITEMS.map(({ kind, label, href }) => ({ kind, label, href }))).toEqual(
            EXPECTED_NEW_ITEMS.map(({ kind, label, href }) => ({ kind, label, href }))
        )
    })

    it('gives the New items the id suffixes of their NEW_ACTIONS ids', () => {
        expect(LIST_AREAS.purchases.newItems).toEqual(EXPECTED_NEW_ITEMS)
    })
})

describe('tableMinWidthFor of the purchase tabs', () => {
    // The reference minimums, with a tick box and a row menu on each row (checkpoint 4).
    it.each(
        EXPECTED_TABS
    )('$label is $writerMinWidth with row actions for a writer and 28 less for a reader', expected => {
        const tab = purchaseTabOf(expected.key)
        expect(tableMinWidthFor(tab, { showTicks: true, showRowMenus: true })).toBe(
            expected.writerMinWidth
        )
        expect(tableMinWidthFor(tab, { showTicks: false, showRowMenus: true })).toBe(
            expected.writerMinWidth - 28
        )
    })

    // Today `hasRowActions` is false for Expenses, so `listControls` draws no tick box and
    // no row menu: a reader's left pad starts each row and no 44 px menu cell ends it.
    it.each(
        EXPECTED_TABS
    )('$label is 72 less than $writerMinWidth today, for a writer and a reader', expected => {
        const tab = purchaseTabOf(expected.key)
        for (const canWrite of [true, false]) {
            expect(
                tableMinWidthFor(tab, listControls(canWrite, 'table', areaOf(tab))),
                String(canWrite)
            ).toBe(expected.writerMinWidth - 72)
        }
    })

    it('is 840 for an All purchases writer today', () => {
        const tab = purchaseTabOf('all')
        expect(tableMinWidthFor(tab, listControls(true, 'table', areaOf(tab)))).toBe(840)
    })
})

describe('tabStateKey', () => {
    it('differs for the All sales and the All purchases tab, which share the key all', () => {
        expect(salesTabOf('all').key).toBe(purchaseTabOf('all').key)
        expect(tabStateKey(salesTabOf('all'))).not.toBe(tabStateKey(purchaseTabOf('all')))
        expect(tabStateKey(purchaseTabOf('all'))).toBe('purchases:all')
        expect(tabStateKey(salesTabOf('invoices'))).toBe('sales:invoices')
    })
})

describe('emptyTexts of the purchase tabs', () => {
    it("names the tab's noun", () => {
        expect(emptyTexts(purchaseTabOf('bills'))).toEqual({
            yet: 'No bills yet',
            match: 'No bills match',
        })
        expect(emptyTexts(purchaseTabOf('all'))).toEqual({
            yet: 'No purchase transactions yet',
            match: 'No purchase transactions match',
        })
    })
})

describe('kindLabel', () => {
    it.each([
        ['bill', 'Bill'],
        ['expense', 'Expense'],
        ['bill_payment', 'Bill payment'],
        ['vendor_credit', 'Vendor credit'],
        ['vendor_refund', 'Vendor refund'],
        ['invoice', 'Invoice'],
        ['estimate', 'Estimate'],
        ['sales_receipt', 'Sales receipt'],
        ['payment', 'Payment'],
        ['credit_memo', 'Credit memo'],
    ] as const)('labels %s "%s"', (kind: ListKind, label) => {
        expect(kindLabel(kind)).toBe(label)
    })
})

describe('listDocumentHref', () => {
    const ID = 'doc000000000001'
    it.each([
        ['bill', `books/bills/${ID}`],
        ['expense', `books/expenses/${ID}`],
        ['bill_payment', `books/bill-payments/${ID}`],
        ['vendor_credit', `books/vendor-credits/${ID}`],
        ['vendor_refund', `books/vendor-refunds/${ID}`],
        ['invoice', `books/invoices/${ID}`],
        ['estimate', `books/estimates/${ID}`],
        ['sales_receipt', `books/sales-receipts/${ID}`],
        ['payment', `books/payments/${ID}`],
        ['credit_memo', `books/credit-memos/${ID}`],
    ] as const)('opens a %s at %s', (kind: ListKind, href) => {
        expect(listDocumentHref(kind, ID)).toBe(href)
    })
})

describe('vendorTransactionsTab', () => {
    it('lists five kinds for all and one for a kind, signed, with the All chip only', () => {
        const all = vendorTransactionsTab('all')
        expect([...all.kinds].sort()).toEqual(
            ['bill', 'bill_payment', 'expense', 'vendor_credit', 'vendor_refund'].sort()
        )
        expect(all.isSigned).toBe(true)
        expect(all.area).toBe('purchases')
        expect([...all.chips]).toEqual(chips('All'))
        expect([...all.sortKeys]).toEqual(['date'])
        const credits = vendorTransactionsTab('vendor_credit')
        expect([...credits.kinds]).toEqual(['vendor_credit'])
        expect(credits.isSigned).toBe(true)
    })
})
