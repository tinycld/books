import { describe, expect, it } from 'vitest'
import { shownLineTablesOf } from '../tinycld/books/hooks/useDocumentForm'
import {
    billLinesFromChoice,
    type CopyToBillChoice,
    copyToBillRows,
    copyToBillSchema,
} from '../tinycld/books/lib/copy-to-bill'
import { PRODUCT_IDS, PRODUCTS } from '../tinycld/books/lib/products-services-fixture'
import {
    draftHeld,
    PURCHASE_ORDER_BILLS,
    PURCHASE_ORDER_IDS,
    PURCHASE_ORDER_LINES,
} from '../tinycld/books/lib/purchase-orders-fixture'
import { BILL_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import { useCopyToBillStore } from '../tinycld/books/stores/copy-to-bill-store'

// Copy to bill (purchase order spec §3.7, §3.8): the dialog's rows and their start values,
// its one zod schema, the bill lines a choice (or no choice) gives, and the store that
// hands the choice to the bill form once.
//
// The rows read the order's lines with their product and account rows (the hook's one
// query with materialize()) and the lines of the order's draft bills (`po_line` with the
// quantity or amount each holds).

const accountId = (number: string) => `acc-${number}`

function productRowOf(id: string) {
    const row = PRODUCTS.find(product => product.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return { name: row.name, vendor_part_no: row.vendor_part_no }
}

function accountRowOf(number: string) {
    const row = SEED_ACCOUNTS.find(account => account.number === number)
    if (!row) throw new Error(`no seed account ${number}`)
    return { number: row.number, name: row.name }
}

// An order's lines as the hook reads them: the stored line (its account by id, as the
// seed maps it) with its product or account row.
function orderLines(orderId: string) {
    return PURCHASE_ORDER_LINES.filter(line => line.purchase_order === orderId).map(
        ({ account_number, ...line }) => ({
            ...line,
            account: account_number ? accountId(account_number) : '',
            productRow: line.product ? productRowOf(line.product) : undefined,
            accountRow: account_number ? accountRowOf(account_number) : undefined,
        })
    )
}

// The lines of an order's draft bills (PURCHASE_ORDER_BILLS), as the dialog reads them.
function draftLinesOf(orderId: string) {
    return PURCHASE_ORDER_BILLS.filter(
        bill => bill.purchase_order === orderId && bill.status === 'draft'
    ).flatMap(bill => bill.lines)
}

function lineAt(orderId: string, position: number) {
    const line = orderLines(orderId).find(row => row.position === position)
    if (!line) throw new Error(`no line ${position} on ${orderId}`)
    return line
}

const PARTLY = PURCHASE_ORDER_IDS.partly
const DRAFT_BILL = PURCHASE_ORDER_IDS.draftBill
const OPEN = PURCHASE_ORDER_IDS.open

describe('copyToBillRows', () => {
    // Order 1003: account line 0 (6210, $180.00 open), product line 1 (the design licence, 6
    // open), product line 2 (the patch cables, all 12 received: not open), product line 3
    // (5 access points open).
    it('gives one row per open line, product lines under "Products and services" first, then account lines under "Accounts", each in form order', () => {
        const rows = copyToBillRows(orderLines(PARTLY), draftLinesOf(PARTLY))
        expect(rows.map(row => row.lineId)).toEqual([
            lineAt(PARTLY, 1).id,
            lineAt(PARTLY, 3).id,
            lineAt(PARTLY, 0).id,
        ])
        expect(rows.map(row => row.heading)).toEqual([
            'Products and services',
            'Products and services',
            'Accounts',
        ])
        expect(rows.map(row => row.lineId)).not.toContain(lineAt(PARTLY, 2).id)
    })

    it('names a product row by its product and an account row as "<number> <name>", with the line description', () => {
        const rows = copyToBillRows(orderLines(PARTLY), draftLinesOf(PARTLY))
        expect(rows.map(row => row.name)).toEqual([
            'Design software license (annual)',
            'Wireless access point',
            '6210 Design Tools',
        ])
        expect(rows.map(row => row.description)).toEqual([
            lineAt(PARTLY, 1).description,
            lineAt(PARTLY, 3).description,
            'Freight and handling',
        ])
    })

    it('shows "Open 6" on a product row and "Open $180.00" on an account row', () => {
        const rows = copyToBillRows(orderLines(PARTLY), draftLinesOf(PARTLY))
        expect(rows.map(row => row.openText)).toEqual(['Open 6', 'Open 5', 'Open $180.00'])
    })

    // Spec §3.4 (Q17): a product row carries its product's Vendor part no.; an account row
    // never has one.
    it('carries the Vendor part no. on a product row and none on an account row', () => {
        const rows = copyToBillRows(orderLines(PARTLY), draftLinesOf(PARTLY))
        expect(rows.map(row => row.partNo)).toEqual(['SW-DES-ANN', 'HW-WAP-6E', ''])
    })

    it('gives a product row of a product with no Vendor part no. none', () => {
        // Order 1004's Inventory item has no Vendor part no.
        const rows = copyToBillRows(orderLines(OPEN), draftLinesOf(OPEN))
        const printer = rows.find(row => row.lineId === lineAt(OPEN, 3).id)
        expect(printer?.kind).toBe('item')
        expect(printer?.partNo).toBe('')
    })

    // Order 1005: 8 access points ordered, a draft bill holds 3, so the row starts at 5; the
    // account line is on no draft, so it starts at its open $150.00. Both start ticked.
    it('starts each row at the open quantity or amount less what draft bills hold', () => {
        const product = lineAt(DRAFT_BILL, 1)
        const account = lineAt(DRAFT_BILL, 0)
        expect(product.open_quantity).toBe(8)
        expect(draftHeld(product.id).quantity).toBe(3)
        const rows = copyToBillRows(orderLines(DRAFT_BILL), draftLinesOf(DRAFT_BILL))
        expect(rows.find(row => row.lineId === product.id)).toMatchObject({
            kind: 'item',
            quantity: 5,
            isTicked: true,
        })
        expect(rows.find(row => row.lineId === account.id)).toMatchObject({
            kind: 'account',
            amount: 15_000,
            isTicked: true,
        })
    })

    it('lowers an account row by the amount draft bills hold', () => {
        const account = lineAt(DRAFT_BILL, 0)
        const drafts = [{ po_line: account.id, quantity: 0, amount: 4_000 }]
        const rows = copyToBillRows(orderLines(DRAFT_BILL), drafts)
        expect(rows.find(row => row.lineId === account.id)).toMatchObject({
            amount: 11_000,
            isTicked: true,
        })
    })

    it('never starts below 0, and a row that starts at 0 starts unticked', () => {
        const product = lineAt(DRAFT_BILL, 1)
        const account = lineAt(DRAFT_BILL, 0)
        const drafts = [
            { po_line: product.id, quantity: 10, amount: 121_400 },
            { po_line: account.id, quantity: 0, amount: 15_000 },
        ]
        const rows = copyToBillRows(orderLines(DRAFT_BILL), drafts)
        expect(rows.find(row => row.lineId === product.id)).toMatchObject({
            quantity: 0,
            isTicked: false,
        })
        expect(rows.find(row => row.lineId === account.id)).toMatchObject({
            amount: 0,
            isTicked: false,
        })
    })

    it('counts every draft line that names the order line', () => {
        const product = lineAt(DRAFT_BILL, 1)
        const drafts = [
            { po_line: product.id, quantity: 3, amount: 36_420 },
            { po_line: product.id, quantity: 2, amount: 24_280 },
        ]
        const rows = copyToBillRows(orderLines(DRAFT_BILL), drafts)
        expect(rows.find(row => row.lineId === product.id)?.quantity).toBe(3)
    })
})

// The dialog's form values: one row per open line, with its tick, its Qty to bill (a
// product row) and its Amount to bill (an account row, money text). Core NumberInput writes
// '' when its text is cleared (core/ui/form/NumberInput.tsx), so a quantity may be ''.
type FormRow = {
    lineId: string
    kind: 'item' | 'account'
    isTicked: boolean
    quantity: number | ''
    amount: string
}

const item = (patch: Partial<FormRow> = {}): FormRow => ({
    lineId: 'poline00000item',
    kind: 'item',
    isTicked: true,
    quantity: 4,
    amount: '',
    ...patch,
})

const account = (patch: Partial<FormRow> = {}): FormRow => ({
    lineId: 'poline00000acct',
    kind: 'account',
    isTicked: true,
    quantity: 0,
    amount: '120.00',
    ...patch,
})

function messagesOf(rows: FormRow[]): string[] {
    const result = copyToBillSchema.safeParse({ rows })
    if (result.success) return []
    return result.error.issues.map(issue => issue.message)
}

describe('copyToBillSchema', () => {
    it('passes ticked rows with a quantity above 0 and an amount that is not 0', () => {
        expect(copyToBillSchema.safeParse({ rows: [item(), account()] }).success).toBe(true)
    })

    it('refuses no ticked row with "Choose at least one line."', () => {
        const rows = [item({ isTicked: false }), account({ isTicked: false })]
        expect(copyToBillSchema.safeParse({ rows }).success).toBe(false)
        expect(messagesOf(rows)).toContain('Choose at least one line.')
    })

    it.each([
        ['0', 0],
        ['a negative quantity', -1],
        ['3 decimals', 1.234],
    ])('refuses a ticked product row with %s', (_label, quantity) => {
        expect(copyToBillSchema.safeParse({ rows: [item({ quantity })] }).success).toBe(false)
    })

    it('passes a ticked quantity with 2 decimals', () => {
        expect(copyToBillSchema.safeParse({ rows: [item({ quantity: 1.25 })] }).success).toBe(true)
    })

    it('refuses a ticked account row whose amount is 0', () => {
        expect(copyToBillSchema.safeParse({ rows: [account({ amount: '0.00' })] }).success).toBe(
            false
        )
    })

    it('passes an unticked row whose value is not valid, while another row is ticked', () => {
        const rows = [item({ isTicked: false, quantity: 0 }), account()]
        expect(copyToBillSchema.safeParse({ rows }).success).toBe(true)
        const accounts = [item(), account({ isTicked: false, amount: '0.00' })]
        expect(copyToBillSchema.safeParse({ rows: accounts }).success).toBe(true)
    })

    it('passes an unticked product row whose quantity text is cleared', () => {
        const rows = [item({ isTicked: false, quantity: '' }), account()]
        expect(copyToBillSchema.safeParse({ rows }).success).toBe(true)
    })

    it('refuses a ticked product row whose quantity text is cleared with the quantity message', () => {
        const rows = [item({ quantity: '' }), account()]
        expect(messagesOf(rows)).toEqual(['Enter a quantity more than 0'])
    })

    // Spec §3.7 (Q5): more than is open is allowed; the dialog shows a hint, not an error.
    it('passes a quantity or an amount above the open one', () => {
        const rows = [item({ quantity: 999 }), account({ amount: '99,999.00' })]
        expect(copyToBillSchema.safeParse({ rows }).success).toBe(true)
    })
})

describe('billLinesFromChoice', () => {
    // Order 1004: account line 0 (6210, $45.00), product lines 1 (6 access points at
    // $121.40), 2 (72.5 patch cables at $3.12) and 3 (2 label printers at $288.90).
    const lines = orderLines(OPEN)

    it('gives each chosen row a bill line with its table, account or product, description, rate, the chosen quantity or amount, and po_line', () => {
        const choice: CopyToBillChoice = {
            lines: [
                { po_line: lineAt(OPEN, 0).id, quantity: 0, amount: 3_000 },
                { po_line: lineAt(OPEN, 1).id, quantity: 4, amount: 0 },
            ],
        }
        const rows = billLinesFromChoice(lines, choice)
        expect(rows.account_lines).toHaveLength(1)
        expect(rows.account_lines[0]).toMatchObject({
            kind: 'account',
            account: accountId('6210'),
            description: 'Delivery and setup, back office',
            amount: '30.00',
            po_line: lineAt(OPEN, 0).id,
        })
        expect(rows.item_lines).toHaveLength(1)
        expect(rows.item_lines[0]).toMatchObject({
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: 'Wi-Fi 6E access point, ceiling mount, PoE powered.',
            quantity: 4,
            rate: '121.40',
            po_line: lineAt(OPEN, 1).id,
        })
    })

    it('leaves out every line the choice does not name', () => {
        const choice: CopyToBillChoice = {
            lines: [{ po_line: lineAt(OPEN, 2).id, quantity: 10, amount: 0 }],
        }
        const rows = billLinesFromChoice(lines, choice)
        expect(rows.account_lines).toEqual([])
        expect(rows.item_lines.map(row => row.po_line)).toEqual([lineAt(OPEN, 2).id])
        expect(rows.item_lines[0]).toMatchObject({ quantity: 10, rate: '3.12' })
    })

    it('gives each bill line a new id, never the order line id', () => {
        const rows = billLinesFromChoice(lines, undefined)
        const ids = [...rows.account_lines, ...rows.item_lines].map(row => row.id)
        for (const line of lines) expect(ids).not.toContain(line.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('with no choice takes every open line at its open quantity or amount, in form order', () => {
        const rows = billLinesFromChoice(lines, undefined)
        expect(rows.account_lines.map(row => [row.po_line, row.amount])).toEqual([
            [lineAt(OPEN, 0).id, '45.00'],
        ])
        expect(rows.item_lines.map(row => [row.po_line, row.quantity])).toEqual([
            [lineAt(OPEN, 1).id, 6],
            [lineAt(OPEN, 2).id, 72.5],
            [lineAt(OPEN, 3).id, 2],
        ])
    })

    it('with no choice leaves out a line that is not open', () => {
        const rows = billLinesFromChoice(orderLines(PARTLY), undefined)
        const named = [...rows.account_lines, ...rows.item_lines].map(row => row.po_line)
        expect(named).not.toContain(lineAt(PARTLY, 2).id)
        expect(rows.item_lines.map(row => [row.po_line, row.quantity])).toEqual([
            [lineAt(PARTLY, 1).id, 6],
            [lineAt(PARTLY, 3).id, 5],
        ])
        expect(rows.account_lines.map(row => row.amount)).toEqual(['180.00'])
    })
})

// The bill's own table rule (spec §3.8, Q10): a table shows when the bill has a line of
// it, so a bill started from an order with lines of both tables shows both, whatever the
// "Bill lines" setting says.
describe('the tables of a bill started from an order', () => {
    it.each(['both', 'accounts', 'products'] as const)('shows both tables under "%s"', setting => {
        const rows = billLinesFromChoice(orderLines(OPEN), undefined)
        const start = { kind: 'bill', purchaseLines: setting } as const
        expect(shownLineTablesOf(BILL_KIND, start, rows)).toEqual(['account_lines', 'item_lines'])
    })
})

describe('useCopyToBillStore', () => {
    const choiceOf = (lineId: string, quantity: number): CopyToBillChoice => ({
        lines: [{ po_line: lineId, quantity, amount: 0 }],
    })

    it('keeps one choice per order id', () => {
        const store = useCopyToBillStore.getState()
        store.put('po-a', choiceOf('line-a', 1))
        store.put('po-b', choiceOf('line-b', 2))
        store.put('po-a', choiceOf('line-a', 3))
        expect(useCopyToBillStore.getState().take('po-b')).toEqual(choiceOf('line-b', 2))
        expect(useCopyToBillStore.getState().take('po-a')).toEqual(choiceOf('line-a', 3))
    })

    it('take reads a choice once and clears it', () => {
        useCopyToBillStore.getState().put('po-c', choiceOf('line-c', 4))
        expect(useCopyToBillStore.getState().take('po-c')).toEqual(choiceOf('line-c', 4))
        expect(useCopyToBillStore.getState().take('po-c')).toBeUndefined()
    })

    it('take of an order with no choice gives nothing and leaves the others', () => {
        useCopyToBillStore.getState().put('po-d', choiceOf('line-d', 5))
        expect(useCopyToBillStore.getState().take('po-none')).toBeUndefined()
        expect(useCopyToBillStore.getState().take('po-d')).toEqual(choiceOf('line-d', 5))
    })
})
