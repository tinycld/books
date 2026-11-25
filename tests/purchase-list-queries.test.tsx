// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { describe, expect, it, vi } from 'vitest'
import { useCustomerTransactions } from '../tinycld/books/hooks/useCustomerTransactions'
import { useDocumentList } from '../tinycld/books/hooks/useDocumentList'
import { usePurchaseCategories } from '../tinycld/books/hooks/usePurchaseCategories'
import { useVendorTransactions } from '../tinycld/books/hooks/useVendorTransactions'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import {
    DEFAULT_LIST_FILTERS,
    DEFAULT_LIST_SORT,
    type DocumentListFilters,
    type DocumentListRow,
    type DocumentListTab,
    type ListSort,
} from '../tinycld/books/lib/document-list'
import { purchaseTabOf } from '../tinycld/books/lib/purchase-lists'
import { todayIso } from '../tinycld/books/lib/register-range'
import { salesTabOf } from '../tinycld/books/lib/sales-lists'
import {
    billPaymentRow,
    billRow,
    expenseRow,
    type VendorTransactionFilter,
    vendorCreditRow,
    vendorRefundRow,
} from '../tinycld/books/lib/vendor-transactions'
import { accountsStore, heldOnDemandStore, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

// The purchase list reads (spec docs/specs/purchase-lists-design.md §4 "Data"), on the
// Books harness. The harness loader applies only the `eq` filters of a load on its fake
// server (a load with an `or` or an `ilike` serves every row), so these cases prove the
// client expression of each query: its `where`, order, limit and select. The e2e specs of
// checkpoint 3 prove the filter string PocketBase gets for search, chip, range and Overdue.

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// Far from today on either side, so a due date is past or not past on any run day.
const PAST = '2026-07-15'
const FUTURE = '2099-12-31'

const VENDOR_A = 'vendlistaaaaa01'
const VENDOR_B = 'vendlistbbbbb01'
const VENDORS = [
    { id: VENDOR_A, display_name: 'Acme Paper Supply', inactive: false },
    { id: VENDOR_B, display_name: 'Bolt Hardware', inactive: false },
]

const ACCOUNT = ACCOUNTS[0]
const PRODUCT = { id: 'prodlist0000001', name: 'Copy paper case', active: true }

let next = 0
// A strictly later `created` for each row made, so creation order is the call order.
function stamp() {
    next += 1
    return `2026-10-01 00:00:00.${String(next).padStart(3, '0')}Z`
}

type Doc = {
    id: string
    vendor?: string
    status?: 'draft' | 'posted' | 'void'
    number?: string
    date?: string
    created?: string
}

function head(over: Doc) {
    const status = over.status ?? ('posted' as const)
    const number = over.number ?? (status === 'draft' ? '' : String(++next))
    return {
        vendor: '',
        status,
        number,
        sequence: number === '' ? 0 : Number(number),
        date: '2026-10-10',
        currency: 'USD',
        entry: status === 'draft' ? '' : `entry${over.id.slice(5)}`,
        replaced_by: '',
        created: stamp(),
        ...over,
    }
}

function bill(
    over: Doc & {
        due_date?: string
        total?: number
        balance?: number
        ref_no?: string
        memo?: string
        replaced_by?: string
    }
) {
    const total = over.total ?? 10_000
    return {
        due_date: FUTURE,
        ref_no: '',
        memo: `memo ${over.id}`,
        total,
        balance: (over.status ?? 'posted') === 'posted' ? total : 0,
        ...head(over),
        ...over,
    }
}

function expense(over: Doc & { total?: number; reference_no?: string; memo?: string }) {
    return { reference_no: '', memo: `memo ${over.id}`, total: 2_000, ...head(over), ...over }
}

function billPayment(over: Doc & { total?: number; reference_no?: string }) {
    return { reference_no: '', total: 5_000, ...head(over), ...over }
}

function vendorCredit(
    over: Doc & { total?: number; balance?: number; ref_no?: string; memo?: string }
) {
    const total = over.total ?? 3_000
    return {
        ref_no: '',
        memo: `memo ${over.id}`,
        total,
        balance: (over.status ?? 'posted') === 'posted' ? total : 0,
        ...head(over),
        ...over,
    }
}

function vendorRefund(over: Doc & { amount?: number; reference_no?: string; memo?: string }) {
    return { reference_no: '', memo: `memo ${over.id}`, amount: 1_500, ...head(over), ...over }
}

function line(
    parentField: string,
    parent: string,
    position: number,
    of: { account?: string; product?: string }
) {
    return {
        id: `ln${position}${parent.slice(3)}`,
        [parentField]: parent,
        kind: of.product ? 'item' : 'account',
        account: of.account ?? '',
        product: of.product ?? '',
        description: '',
        quantity: of.product ? 1 : 0,
        rate: of.product ? 100 : 0,
        amount: 100,
        position,
        created: '',
        updated: '',
    }
}

type Data = {
    bills?: ReturnType<typeof bill>[]
    expenses?: ReturnType<typeof expense>[]
    billPayments?: ReturnType<typeof billPayment>[]
    vendorCredits?: ReturnType<typeof vendorCredit>[]
    vendorRefunds?: ReturnType<typeof vendorRefund>[]
    billLines?: ReturnType<typeof line>[]
    expenseLines?: ReturnType<typeof line>[]
    vendorCreditLines?: ReturnType<typeof line>[]
    invoices?: { id: string }[]
    refuseVendors?: boolean
    refuseBills?: boolean
    accountsFailsOnce?: boolean
}

// The registry after seedBooks: every list collection loaded on demand, counting its loads.
function seedList(data: Data = {}) {
    seedBooks({
        accountsFailsOnce: data.accountsFailsOnce,
        ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
    })
    const purchases = {
        books_bills: heldOnDemandStore('books_bills', data.bills ?? [], {
            refuseFirstLoad: data.refuseBills,
        }),
        books_expenses: heldOnDemandStore('books_expenses', data.expenses ?? []),
        books_bill_payments: heldOnDemandStore('books_bill_payments', data.billPayments ?? []),
        books_vendor_credits: heldOnDemandStore('books_vendor_credits', data.vendorCredits ?? []),
        books_vendor_refunds: heldOnDemandStore('books_vendor_refunds', data.vendorRefunds ?? []),
        books_bill_lines: heldOnDemandStore('books_bill_lines', data.billLines ?? []),
        books_expense_lines: heldOnDemandStore('books_expense_lines', data.expenseLines ?? []),
        books_vendor_credit_lines: heldOnDemandStore(
            'books_vendor_credit_lines',
            data.vendorCreditLines ?? []
        ),
        books_vendors: heldOnDemandStore('books_vendors', VENDORS, {
            refuseFirstLoad: data.refuseVendors,
        }),
    }
    const sales = {
        books_invoices: heldOnDemandStore('books_invoices', data.invoices ?? []),
        books_estimates: heldOnDemandStore('books_estimates', []),
        books_sales_receipts: heldOnDemandStore('books_sales_receipts', []),
        books_payments: heldOnDemandStore('books_payments', []),
        books_credit_memos: heldOnDemandStore('books_credit_memos', []),
        books_refund_receipts: heldOnDemandStore('books_refund_receipts', []),
        books_customers: heldOnDemandStore('books_customers', []),
    }
    const products = heldOnDemandStore('books_products', [PRODUCT])
    return { purchases, sales, products }
}

type Stores = Record<string, { loads(): number; hold(): void; release(): void }>

const loadsOf = (stores: Stores) =>
    Object.fromEntries(Object.entries(stores).map(([name, store]) => [name, store.loads()]))
const totalLoads = (stores: Stores) =>
    Object.values(stores).reduce((sum, store) => sum + store.loads(), 0)
const holdAll = (stores: Stores) => {
    for (const store of Object.values(stores)) store.hold()
}
const releaseAll = (stores: Stores) => {
    for (const store of Object.values(stores)) store.release()
}

type ListProps = { tab: DocumentListTab; filters?: Partial<DocumentListFilters>; sort?: ListSort }

function renderList(props: ListProps) {
    return renderHook(
        ({ tab, filters, sort }: ListProps) =>
            useDocumentList({
                tab,
                filters: { ...DEFAULT_LIST_FILTERS, ...filters },
                sort: sort ?? DEFAULT_LIST_SORT,
            }),
        { initialProps: props }
    )
}

async function readyRows(props: ListProps) {
    const hook = renderList(props)
    await waitFor(() => {
        expect(hook.result.current.isLoading).toBe(false)
        expect(hook.result.current.isBusy).toBe(false)
    })
    return hook
}

const idsOf = (rows: readonly { id: string }[]) => rows.map(row => row.id)
const rowOf = (rows: readonly DocumentListRow[], id: string) => rows.find(row => row.id === id)

const ALL = purchaseTabOf('all')
const BILLS = purchaseTabOf('bills')

describe('useDocumentList on All purchases: the 50-row window', () => {
    // 24 rows of each of the five kinds, on 30 dates, some on the same date.
    const KIND_COUNT = 24
    const day = (i: number) => `2026-09-${String((i % 30) + 1).padStart(2, '0')}`
    const make = () => {
        next = 0
        const bills = Array.from({ length: KIND_COUNT }, (_, i) =>
            bill({ id: `plwbill${String(i).padStart(8, '0')}`, date: day(i * 5) })
        )
        const expenses = Array.from({ length: KIND_COUNT }, (_, i) =>
            expense({ id: `plwexpe${String(i).padStart(8, '0')}`, date: day(i * 5 + 1) })
        )
        const billPayments = Array.from({ length: KIND_COUNT }, (_, i) =>
            billPayment({ id: `plwbpay${String(i).padStart(8, '0')}`, date: day(i * 5 + 2) })
        )
        const vendorCredits = Array.from({ length: KIND_COUNT }, (_, i) =>
            vendorCredit({ id: `plwcred${String(i).padStart(8, '0')}`, date: day(i * 5 + 3) })
        )
        const vendorRefunds = Array.from({ length: KIND_COUNT }, (_, i) =>
            vendorRefund({ id: `plwrefu${String(i).padStart(8, '0')}`, date: day(i * 5 + 4) })
        )
        const all = [...bills, ...expenses, ...billPayments, ...vendorCredits, ...vendorRefunds]
        // Date, newest first, then creation time, newest first.
        const order = [...all]
            .sort((a, b) =>
                a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.created < b.created ? 1 : -1
            )
            .map(row => row.id)
        return { data: { bills, expenses, billPayments, vendorCredits, vendorRefunds }, order }
    }

    it('shows 50, then 100, then all 120 rows in order, keeping the 50 while the next load is held', async () => {
        const { data, order } = make()
        expect(order).toHaveLength(120)
        const { purchases } = seedList(data)
        const hook = await readyRows({ tab: ALL })
        expect(idsOf(hook.result.current.rows)).toEqual(order.slice(0, 50))
        expect(hook.result.current.hasMore).toBe(true)

        const before = totalLoads(purchases)
        holdAll(purchases)
        act(() => hook.result.current.loadMore())
        await waitFor(() => expect(totalLoads(purchases)).toBeGreaterThan(before))
        expect(idsOf(hook.result.current.rows)).toEqual(order.slice(0, 50))
        expect(hook.result.current.isBusy).toBe(true)
        releaseAll(purchases)

        await waitFor(() => expect(hook.result.current.rows).toHaveLength(100))
        expect(idsOf(hook.result.current.rows)).toEqual(order.slice(0, 100))
        expect(hook.result.current.hasMore).toBe(true)

        act(() => hook.result.current.loadMore())
        await waitFor(() => expect(hook.result.current.rows).toHaveLength(120))
        expect(idsOf(hook.result.current.rows)).toEqual(order)
        await waitFor(() => expect(hook.result.current.hasMore).toBe(false))
    })
})

describe('useDocumentList on All purchases: rows and the listed rule', () => {
    it('lists an expense with no vendor with an empty party name, and the vendor of a bill', async () => {
        seedList({
            expenses: [expense({ id: 'plnovendexp0001', vendor: '' })],
            bills: [bill({ id: 'plvendbill00001', vendor: VENDOR_A })],
        })
        const hook = await readyRows({ tab: ALL })
        const noVendor = rowOf(hook.result.current.rows, 'plnovendexp0001')
        expect(noVendor).toBeDefined()
        expect(noVendor?.partyName).toBe('')
        expect(noVendor?.partyId).toBe('')
        const vended = rowOf(hook.result.current.rows, 'plvendbill00001')
        expect(vended?.partyId).toBe(VENDOR_A)
        expect(vended?.partyName).toBe('Acme Paper Supply')
    })

    it('leaves out a void bill that a correction replaced and lists a plain void bill', async () => {
        seedList({
            bills: [
                bill({ id: 'plreplacedold01', status: 'void', replaced_by: 'plreplacedfix01' }),
                bill({ id: 'plreplacedfix01' }),
                bill({ id: 'plplainvoid0001', status: 'void' }),
            ],
        })
        const hook = await readyRows({ tab: ALL })
        const ids = idsOf(hook.result.current.rows)
        expect(ids).not.toContain('plreplacedold01')
        expect(ids).toContain('plreplacedfix01')
        expect(ids).toContain('plplainvoid0001')
    })
})

describe('useDocumentList: the category of a purchase row', () => {
    it('reads account, product, split and none from the first lines', async () => {
        seedList({
            bills: [
                bill({ id: 'plcatacct000001' }),
                bill({ id: 'plcatprod000001' }),
                bill({ id: 'plcatsplit00001' }),
                bill({ id: 'plcatnone000001' }),
            ],
            billLines: [
                line('bill', 'plcatacct000001', 0, { account: ACCOUNT.id }),
                line('bill', 'plcatprod000001', 0, { product: PRODUCT.id }),
                line('bill', 'plcatsplit00001', 0, { account: ACCOUNT.id }),
                line('bill', 'plcatsplit00001', 1, { product: PRODUCT.id }),
            ],
            expenses: [expense({ id: 'plcatexpense001' })],
            expenseLines: [line('expense', 'plcatexpense001', 0, { account: ACCOUNT.id })],
            vendorCredits: [vendorCredit({ id: 'plcatcredit0001' })],
            vendorCreditLines: [
                line('vendor_credit', 'plcatcredit0001', 0, { product: PRODUCT.id }),
            ],
            billPayments: [billPayment({ id: 'plcatbillpay001' })],
            vendorRefunds: [vendorRefund({ id: 'plcatrefund0001' })],
        })
        const hook = await readyRows({ tab: ALL })
        await waitFor(() =>
            expect(rowOf(hook.result.current.rows, 'plcatsplit00001')?.category).toEqual({
                kind: 'split',
            })
        )
        const rows = hook.result.current.rows
        expect(rowOf(rows, 'plcatacct000001')?.category).toEqual({
            kind: 'account',
            id: ACCOUNT.id,
        })
        expect(rowOf(rows, 'plcatprod000001')?.category).toEqual({
            kind: 'product',
            id: PRODUCT.id,
        })
        expect(rowOf(rows, 'plcatnone000001')?.category).toEqual({ kind: 'none' })
        expect(rowOf(rows, 'plcatexpense001')?.category).toEqual({
            kind: 'account',
            id: ACCOUNT.id,
        })
        expect(rowOf(rows, 'plcatcredit0001')?.category).toEqual({
            kind: 'product',
            id: PRODUCT.id,
        })
        expect(rowOf(rows, 'plcatbillpay001')?.category).toEqual({ kind: 'none' })
        expect(rowOf(rows, 'plcatrefund0001')?.category).toEqual({ kind: 'none' })
    })
})

describe('useDocumentList: search on All purchases', () => {
    const data = () => ({
        bills: [
            bill({ id: 'plsearchbill001', vendor: VENDOR_A, ref_no: 'QX7731' }),
            bill({ id: 'plsearchbill002', vendor: VENDOR_A }),
        ],
        billPayments: [
            billPayment({ id: 'plsearchbpay001', vendor: VENDOR_A, reference_no: 'ACH5512' }),
        ],
    })

    it('finds a bill by a piece of its ref_no', async () => {
        seedList(data())
        const hook = await readyRows({ tab: ALL, filters: { search: 'x77' } })
        expect(idsOf(hook.result.current.rows)).toEqual(['plsearchbill001'])
    })

    it('finds a bill payment by a piece of its reference_no', async () => {
        seedList(data())
        const hook = await readyRows({ tab: ALL, filters: { search: 'h551' } })
        expect(idsOf(hook.result.current.rows)).toEqual(['plsearchbpay001'])
    })

    it("finds nothing by the vendor's display name", async () => {
        seedList(data())
        const hook = await readyRows({ tab: ALL, filters: { search: 'Acme' } })
        expect(hook.result.current.rows).toEqual([])
    })
})

describe('useDocumentList: the All purchases chips (spec §3 chip table)', () => {
    const DATA = {
        bills: [
            bill({ id: 'plchbillopen001', due_date: FUTURE }),
            bill({ id: 'plchbillover001', due_date: PAST }),
            bill({ id: 'plchbillpaid001', due_date: PAST, balance: 0 }),
            bill({ id: 'plchbilldraft01', status: 'draft' }),
            bill({ id: 'plchbillvoid001', status: 'void' }),
        ],
        expenses: [
            expense({ id: 'plchexpposted01' }),
            expense({ id: 'plchexpdraft001', status: 'draft' }),
            expense({ id: 'plchexpvoid0001', status: 'void' }),
        ],
        billPayments: [
            billPayment({ id: 'plchbpposted001' }),
            billPayment({ id: 'plchbpvoid00001', status: 'void' }),
        ],
        vendorCredits: [
            vendorCredit({ id: 'plchvcopen00001' }),
            vendorCredit({ id: 'plchvcclosed001', balance: 0 }),
            vendorCredit({ id: 'plchvcdraft0001', status: 'draft' }),
            vendorCredit({ id: 'plchvcvoid00001', status: 'void' }),
        ],
        vendorRefunds: [
            vendorRefund({ id: 'plchvrposted001' }),
            vendorRefund({ id: 'plchvrdraft0001', status: 'draft' }),
            vendorRefund({ id: 'plchvrvoid00001', status: 'void' }),
        ],
    }
    const STORE = {
        bill: 'books_bills',
        expense: 'books_expenses',
        bill_payment: 'books_bill_payments',
        vendor_credit: 'books_vendor_credits',
        vendor_refund: 'books_vendor_refunds',
    } as const
    // Per chip and kind, the ids the cell lists; null is a "none" cell.
    const TABLE: Record<string, Record<keyof typeof STORE, string[] | null>> = {
        open: {
            bill: ['plchbillopen001', 'plchbillover001'],
            expense: null,
            bill_payment: null,
            vendor_credit: ['plchvcopen00001'],
            vendor_refund: null,
        },
        overdue: {
            bill: ['plchbillover001'],
            expense: null,
            bill_payment: null,
            vendor_credit: null,
            vendor_refund: null,
        },
        closed: {
            bill: ['plchbillpaid001'],
            expense: ['plchexpposted01'],
            bill_payment: ['plchbpposted001'],
            vendor_credit: ['plchvcclosed001'],
            vendor_refund: ['plchvrposted001'],
        },
        draft: {
            bill: ['plchbilldraft01'],
            expense: ['plchexpdraft001'],
            bill_payment: null,
            vendor_credit: ['plchvcdraft0001'],
            vendor_refund: ['plchvrdraft0001'],
        },
        void: {
            bill: ['plchbillvoid001'],
            expense: ['plchexpvoid0001'],
            bill_payment: ['plchbpvoid00001'],
            vendor_credit: ['plchvcvoid00001'],
            vendor_refund: ['plchvrvoid00001'],
        },
    }
    const CASES = Object.entries(TABLE).flatMap(([chip, kinds]) =>
        (Object.keys(kinds) as (keyof typeof STORE)[]).map(kind => ({
            chip,
            kind,
            expected: kinds[kind],
        }))
    )

    it.each(CASES)('chip $chip lists per $kind what the table says', async ({
        chip,
        kind,
        expected,
    }) => {
        const { purchases } = seedList(DATA)
        const hook = await readyRows({ tab: ALL, filters: { chip } })
        const listed = hook.result.current.rows
            .filter(row => row.kind === kind)
            .map(row => row.id)
            .sort()
        if (expected === null) {
            expect(listed).toEqual([])
            // A chip that lists nothing of a kind does not run that kind's query.
            expect(purchases[STORE[kind]].loads()).toBe(0)
            return
        }
        expect(listed).toEqual([...expected].sort())
    })
})

describe('useDocumentList: the Bills chips', () => {
    const DATA = {
        bills: [
            bill({ id: 'plbchoverdue001', due_date: PAST, total: 10_000, balance: 10_000 }),
            bill({ id: 'plbchpartly0001', due_date: FUTURE, total: 10_000, balance: 4_000 }),
            bill({ id: 'plbchnodue00001', due_date: '', total: 10_000, balance: 10_000 }),
            bill({ id: 'plbchpaid000001', due_date: PAST, total: 10_000, balance: 0 }),
        ],
    }

    it('Open lists every posted bill with a balance: overdue, partly paid and no due date', async () => {
        seedList(DATA)
        const hook = await readyRows({ tab: BILLS, filters: { chip: 'open' } })
        expect(idsOf(hook.result.current.rows).sort()).toEqual(
            ['plbchnodue00001', 'plbchoverdue001', 'plbchpartly0001'].sort()
        )
        expect(rowOf(hook.result.current.rows, 'plbchoverdue001')?.status.label).toBe('Overdue')
        expect(rowOf(hook.result.current.rows, 'plbchpartly0001')?.status.label).toBe('Partly paid')
    })

    it('Overdue lists only the bill past its due date, not one with no due date', async () => {
        seedList(DATA)
        const hook = await readyRows({ tab: BILLS, filters: { chip: 'overdue' } })
        expect(idsOf(hook.result.current.rows)).toEqual(['plbchoverdue001'])
    })
})

describe('useDocumentList: purchase sort', () => {
    it('sorts Amount ascending by the signed value on All purchases: a credit of 40000 before a bill of 0', async () => {
        seedList({
            bills: [bill({ id: 'plsortbillzero1', total: 0, balance: 0 })],
            vendorCredits: [vendorCredit({ id: 'plsortcredit001', total: 40_000 })],
        })
        const hook = await readyRows({ tab: ALL, sort: { key: 'amount', isAscending: true } })
        expect(idsOf(hook.result.current.rows)).toEqual(['plsortcredit001', 'plsortbillzero1'])
        expect(rowOf(hook.result.current.rows, 'plsortcredit001')?.total).toBe(-40_000)
    })

    it('shows the credit total positive on the Vendor credits tab', async () => {
        seedList({ vendorCredits: [vendorCredit({ id: 'plsortcredit001', total: 40_000 })] })
        const hook = await readyRows({ tab: purchaseTabOf('vendor-credits') })
        const credit = rowOf(hook.result.current.rows, 'plsortcredit001')
        expect(credit?.total).toBe(40_000)
        expect(credit?.balance).toBe(40_000)
    })

    it('sorts No. ascending by sequence: the draft first, then 9 before 10', async () => {
        seedList({
            bills: [
                bill({ id: 'plsortnumber010', number: '10' }),
                bill({ id: 'plsortnumber009', number: '9' }),
                bill({ id: 'plsortnumdraft1', status: 'draft' }),
            ],
        })
        const hook = await readyRows({ tab: BILLS, sort: { key: 'number', isAscending: true } })
        expect(idsOf(hook.result.current.rows)).toEqual([
            'plsortnumdraft1',
            'plsortnumber009',
            'plsortnumber010',
        ])
    })

    it.each([
        true,
        false,
    ])('keeps two rows on one date newest created first (ascending %s)', async isAscending => {
        next = 0
        const older = bill({ id: 'plsortolder0001', date: '2026-10-20' })
        const newer = bill({ id: 'plsortnewer0001', date: '2026-10-20' })
        seedList({ bills: [older, newer] })
        const hook = await readyRows({ tab: BILLS, sort: { key: 'date', isAscending } })
        expect(idsOf(hook.result.current.rows)).toEqual(['plsortnewer0001', 'plsortolder0001'])
    })
})

describe('useDocumentList: the areas read only their own collections', () => {
    const invoice = (id: string) => ({
        id,
        customer: '',
        status: 'posted',
        number: '1001',
        sequence: 1001,
        date: '2026-10-05',
        due_date: '',
        total: 100,
        balance: 100,
        memo: `memo ${id}`,
        replaced_by: '',
        entry: '',
        currency: 'USD',
        created: stamp(),
    })
    const DATA = () => ({
        invoices: [invoice('plareainvoice01')],
        bills: [bill({ id: 'plareabill00001' })],
        expenses: [expense({ id: 'plareaexpense01' })],
    })

    it('a sales tab sends no request to a purchase collection', async () => {
        const { purchases, sales } = seedList(DATA())
        const hook = await readyRows({ tab: salesTabOf('all') })
        expect(idsOf(hook.result.current.rows)).toEqual(['plareainvoice01'])
        expect(sales.books_invoices.loads()).toBeGreaterThan(0)
        expect(loadsOf(purchases)).toEqual(
            Object.fromEntries(Object.keys(purchases).map(name => [name, 0]))
        )
    })

    it('a purchase tab sends no request to a sales collection', async () => {
        const { purchases, sales } = seedList(DATA())
        const hook = await readyRows({ tab: ALL })
        expect(idsOf(hook.result.current.rows).sort()).toEqual([
            'plareabill00001',
            'plareaexpense01',
        ])
        expect(purchases.books_bills.loads()).toBeGreaterThan(0)
        expect(loadsOf(sales)).toEqual(
            Object.fromEntries(Object.keys(sales).map(name => [name, 0]))
        )
    })

    it('the Bills tab sends no request to books_expenses', async () => {
        const { purchases } = seedList(DATA())
        const hook = await readyRows({ tab: BILLS })
        expect(idsOf(hook.result.current.rows)).toEqual(['plareabill00001'])
        expect(purchases.books_expenses.loads()).toBe(0)
    })

    // The lines serve only the Category column (spec §4 "Category").
    const LINE_STORES = ['books_bill_lines', 'books_expense_lines', 'books_vendor_credit_lines']
    const LINE_DATA = () => ({
        bills: [bill({ id: 'pllinesbill0001', vendor: VENDOR_A })],
        billLines: [line('bill', 'pllinesbill0001', 0, { account: ACCOUNT.id })],
        expenses: [expense({ id: 'pllinesexpens01', vendor: VENDOR_A })],
        expenseLines: [line('expense', 'pllinesexpens01', 0, { account: ACCOUNT.id })],
        vendorCredits: [vendorCredit({ id: 'pllinescredit01', vendor: VENDOR_A })],
        vendorCreditLines: [line('vendor_credit', 'pllinescredit01', 0, { account: ACCOUNT.id })],
    })
    const lineLoads = (purchases: Stores) =>
        Object.fromEntries(LINE_STORES.map(name => [name, purchases[name].loads()]))
    const noLineLoads = Object.fromEntries(LINE_STORES.map(name => [name, 0]))

    it('the Bills tab sends no request to a line collection', async () => {
        const { purchases } = seedList(LINE_DATA())
        const hook = await readyRows({ tab: BILLS })
        expect(idsOf(hook.result.current.rows)).toEqual(['pllinesbill0001'])
        expect(rowOf(hook.result.current.rows, 'pllinesbill0001')?.category).toEqual({
            kind: 'none',
        })
        expect(lineLoads(purchases)).toEqual(noLineLoads)
    })

    it('the Vendor credits tab sends no request to a line collection', async () => {
        const { purchases } = seedList(LINE_DATA())
        const hook = await readyRows({ tab: purchaseTabOf('vendor-credits') })
        expect(idsOf(hook.result.current.rows)).toEqual(['pllinescredit01'])
        expect(lineLoads(purchases)).toEqual(noLineLoads)
    })

    it('All purchases reads the lines of its category column', async () => {
        const { purchases } = seedList(LINE_DATA())
        const hook = await readyRows({ tab: ALL })
        await waitFor(() =>
            expect(rowOf(hook.result.current.rows, 'pllinesbill0001')?.category).toEqual({
                kind: 'account',
                id: ACCOUNT.id,
            })
        )
        expect(purchases.books_bill_lines.loads()).toBeGreaterThan(0)
        expect(purchases.books_expense_lines.loads()).toBeGreaterThan(0)
        expect(purchases.books_vendor_credit_lines.loads()).toBeGreaterThan(0)
    })

    it('the Expenses tab reads the lines of its category column', async () => {
        const { purchases } = seedList(LINE_DATA())
        const hook = await readyRows({ tab: purchaseTabOf('expenses') })
        await waitFor(() =>
            expect(rowOf(hook.result.current.rows, 'pllinesexpens01')?.category).toEqual({
                kind: 'account',
                id: ACCOUNT.id,
            })
        )
        expect(purchases.books_expense_lines.loads()).toBeGreaterThan(0)
    })

    it('useVendorTransactions sends no request to a line collection', async () => {
        const { purchases } = seedList(LINE_DATA())
        const hook = renderHook(() => useVendorTransactions(VENDOR_A, 'all'))
        await waitFor(() => expect(hook.result.current.rows).toHaveLength(3))
        expect(hook.result.current.isLoading).toBe(false)
        expect(lineLoads(purchases)).toEqual(noLineLoads)
    })

    it('All purchases shows no row of All sales while its first load is held', async () => {
        const { purchases } = seedList(DATA())
        holdAll(purchases)
        const shown: string[][] = []
        const watch = renderHook(
            ({ tab }: { tab: DocumentListTab }) => {
                const list = useDocumentList({
                    tab,
                    filters: DEFAULT_LIST_FILTERS,
                    sort: DEFAULT_LIST_SORT,
                })
                shown.push(idsOf(list.rows))
                return list
            },
            { initialProps: { tab: salesTabOf('all') } }
        )
        await waitFor(() => expect(idsOf(watch.result.current.rows)).toEqual(['plareainvoice01']))
        shown.length = 0
        watch.rerender({ tab: ALL })
        await waitFor(() => expect(purchases.books_bills.loads()).toBeGreaterThan(0))
        expect(watch.result.current.rows).toEqual([])
        releaseAll(purchases)
        await waitFor(() => expect(watch.result.current.rows).toHaveLength(2))
        expect(shown.flat()).not.toContain('plareainvoice01')
    })
})

describe('useDocumentList and usePurchaseCategories: recovery', () => {
    it('shows a refused vendor read as an error, and retry restores the rows with their party name', async () => {
        const { purchases } = seedList({
            refuseVendors: true,
            bills: [bill({ id: 'plrecoverbill01', vendor: VENDOR_A })],
        })
        expectLiveQueryError(purchases.books_vendors.id)
        const hook = renderList({ tab: ALL })
        await waitFor(() => expect(hook.result.current.isError).toBe(true))
        act(() => hook.result.current.retry())
        await waitFor(() =>
            expect(rowOf(hook.result.current.rows, 'plrecoverbill01')?.partyName).toBe(
                'Acme Paper Supply'
            )
        )
        expect(hook.result.current.isError).toBe(false)
    })

    it('gives a refused account read a recovery, and after it the account name', async () => {
        seedList({ accountsFailsOnce: true })
        expectLiveQueryError(accountsStore().id)
        const rows = [categoryRow({ kind: 'account', id: ACCOUNT.id })]
        const hook = renderHook(() => usePurchaseCategories(rows))
        await waitFor(() => expect(hook.result.current.recovery.queries.length).toBeGreaterThan(0))
        await act(() => recoverLiveQueries(hook.result.current.recovery))
        await waitFor(() => expect(hook.result.current.accounts.get(ACCOUNT.id)).toBe(ACCOUNT.name))
    })

    it('reads the product names of the rows on screen', async () => {
        seedList()
        const rows = [categoryRow({ kind: 'product', id: PRODUCT.id })]
        const hook = renderHook(() => usePurchaseCategories(rows))
        await waitFor(() => expect(hook.result.current.products.get(PRODUCT.id)).toBe(PRODUCT.name))
    })
})

function categoryRow(category: DocumentListRow['category']): DocumentListRow {
    return {
        id: 'plcategoryrow01',
        key: '1',
        kind: 'bill',
        number: '1',
        date: '2026-10-10',
        dueDate: '',
        total: 100,
        currency: 'USD',
        created: '2026-10-10 00:00:00.000Z',
        status: { label: 'Open', tone: 'warning' },
        sequence: 1,
        partyId: '',
        partyName: '',
        memo: '',
        reference: '',
        expires: '',
        balance: 100,
        entry: '',
        convertedInvoice: '',
        recordStatus: 'posted',
        category,
        email: '',
    }
}

describe('useCustomerTransactions with an empty customer id', () => {
    it('lists nothing and sends no request to a sales collection', async () => {
        const invoice = {
            id: 'plcustinvoice01',
            customer: 'custlistaaaaa01',
            status: 'posted',
            number: '1001',
            sequence: 1001,
            date: '2026-10-05',
            due_date: '',
            total: 100,
            balance: 100,
            memo: 'memo plcustinvoice01',
            replaced_by: '',
            entry: '',
            currency: 'USD',
            created: stamp(),
        }
        const { sales } = seedList({ invoices: [invoice] })
        const hook = renderHook(() => useCustomerTransactions('', 'all'))
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
        expect(hook.result.current.rows).toEqual([])
        expect(hook.result.current.isLoading).toBe(false)
        expect(loadsOf(sales)).toEqual(
            Object.fromEntries(Object.keys(sales).map(name => [name, 0]))
        )
    })
})

describe('useVendorTransactions through useDocumentList', () => {
    const today = todayIso()
    const make = () => {
        next = 0
        return {
            bills: [
                bill({
                    id: 'plvtbill0000001',
                    vendor: VENDOR_A,
                    date: '2026-10-05',
                    due_date: PAST,
                }),
                bill({ id: 'plvtotherbill01', vendor: VENDOR_B, date: '2026-10-06' }),
            ],
            expenses: [expense({ id: 'plvtexpense0001', vendor: VENDOR_A, date: '2026-10-04' })],
            billPayments: [
                billPayment({ id: 'plvtbillpay0001', vendor: VENDOR_A, date: '2026-10-03' }),
            ],
            vendorCredits: [
                vendorCredit({
                    id: 'plvtcredit00001',
                    vendor: VENDOR_A,
                    date: '2026-10-02',
                    total: 7_000,
                }),
            ],
            vendorRefunds: [
                vendorRefund({ id: 'plvtrefund00001', vendor: VENDOR_A, date: '2026-10-01' }),
            ],
        }
    }

    type VendorProps = { vendorId: string; filter: VendorTransactionFilter }
    function renderVendor(props: VendorProps, shown?: string[][]) {
        return renderHook(
            ({ vendorId, filter }: VendorProps) => {
                const list = useVendorTransactions(vendorId, filter)
                shown?.push(idsOf(list.rows))
                return list
            },
            { initialProps: props }
        )
    }

    it('gives one row of each kind with the fields and status of lib/vendor-transactions.ts', async () => {
        const data = make()
        seedList(data)
        const hook = renderVendor({ vendorId: VENDOR_A, filter: 'all' })
        await waitFor(() => expect(hook.result.current.rows).toHaveLength(5))
        const rows = hook.result.current.rows
        expect(idsOf(rows)).toEqual([
            'plvtbill0000001',
            'plvtexpense0001',
            'plvtbillpay0001',
            'plvtcredit00001',
            'plvtrefund00001',
        ])
        const [b, e, p, c, r] = rows
        expect(b).toMatchObject(billRow(data.bills[0], today))
        expect(b.status.label).toBe('Overdue')
        expect(e).toMatchObject(expenseRow(data.expenses[0]))
        // A bill payment is never a draft; the builder's status type is wider.
        const payment = { ...data.billPayments[0], status: 'posted' as const }
        expect(p).toMatchObject(billPaymentRow(payment))
        expect(c).toMatchObject(vendorCreditRow(data.vendorCredits[0]))
        expect(c.total).toBe(-7_000)
        expect(r).toMatchObject(vendorRefundRow(data.vendorRefunds[0]))
        expect(idsOf(rows)).not.toContain('plvtotherbill01')
        expect(hook.result.current.recovery).toBeNull()
    })

    it('gives a recovery after a failed read', async () => {
        const { purchases } = seedList({ ...make(), refuseBills: true })
        expectLiveQueryError(purchases.books_bills.id)
        const hook = renderVendor({ vendorId: VENDOR_A, filter: 'all' })
        await waitFor(() => expect(hook.result.current.recovery).not.toBeNull())
        expect(hook.result.current.recovery?.queries.length).toBeGreaterThan(0)
    })

    it('keeps the rows on screen while a change of filter loads', async () => {
        const { purchases } = seedList(make())
        const shown: string[][] = []
        const hook = renderVendor({ vendorId: VENDOR_A, filter: 'all' }, shown)
        await waitFor(() => expect(hook.result.current.rows).toHaveLength(5))
        shown.length = 0
        holdAll(purchases)
        hook.rerender({ vendorId: VENDOR_A, filter: 'bill' })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
        })
        releaseAll(purchases)
        await waitFor(() => expect(idsOf(hook.result.current.rows)).toEqual(['plvtbill0000001']))
        expect(shown.filter(ids => ids.length === 0)).toEqual([])
    })

    it('lists nothing and sends no request with an empty vendor id', async () => {
        const { purchases } = seedList(make())
        const hook = renderVendor({ vendorId: '', filter: 'all' })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
        expect(hook.result.current.rows).toEqual([])
        expect(hook.result.current.isLoading).toBe(false)
        expect(loadsOf(purchases)).toEqual(
            Object.fromEntries(Object.keys(purchases).map(name => [name, 0]))
        )
    })

    it("does not show the first vendor's rows after a change of vendor", async () => {
        const { purchases } = seedList(make())
        const shown: string[][] = []
        const hook = renderVendor({ vendorId: VENDOR_A, filter: 'all' }, shown)
        await waitFor(() => expect(hook.result.current.rows).toHaveLength(5))
        shown.length = 0
        holdAll(purchases)
        hook.rerender({ vendorId: VENDOR_B, filter: 'all' })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
        })
        releaseAll(purchases)
        await waitFor(() => expect(idsOf(hook.result.current.rows)).toEqual(['plvtotherbill01']))
        const firstVendorIds = new Set([
            'plvtbill0000001',
            'plvtexpense0001',
            'plvtbillpay0001',
            'plvtcredit00001',
            'plvtrefund00001',
        ])
        expect(shown.flat().filter(id => firstVendorIds.has(id))).toEqual([])
    })
})
