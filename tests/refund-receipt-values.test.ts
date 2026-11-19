import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { REFUND_RECEIPT_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
import {
    CREDIT_MEMO_IDS,
    CREDIT_MEMO_LINES,
    CREDIT_MEMOS,
} from '../tinycld/books/lib/credit-memo-form-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import type { DepositAccountRow } from '../tinycld/books/lib/deposit-accounts'
import { type CustomerFill, customerFills } from '../tinycld/books/lib/document-fills'
import { DOCUMENT_LINE_MAPPER } from '../tinycld/books/lib/document-line-columns'
import {
    NO_REFUND_FROM_ACCOUNTS,
    REFUND_FROM_ACCOUNT_IDS,
    REFUND_FROM_ACCOUNTS,
    REFUND_RECEIPT_IDS,
    REFUND_RECEIPT_LINES,
    REFUND_RECEIPT_TODAY,
    REFUND_RECEIPTS,
} from '../tinycld/books/lib/refund-receipt-form-fixture'
import {
    copyRefundReceiptValues,
    newRefundReceiptValues,
    refundFromStart,
    refundReceiptCorrectionValues,
} from '../tinycld/books/lib/refund-receipt-values'
import {
    SALES_RECEIPT_IDS,
    SALES_RECEIPT_LINES,
    SALES_RECEIPTS,
} from '../tinycld/books/lib/sales-receipt-form-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'
import type { BooksCustomers } from '../tinycld/books/types'

// Refund receipt spec §3.2 (Refund from), §3.6 (Q8), §3.8 (Copy, Edit).

const TODAY = REFUND_RECEIPT_TODAY
const COPY_DAY = '2026-11-19'
const DEFAULT_MESSAGE = 'Thank you for your business!'

const RATES = TAX_RATE_ROWS.map(rate => ({
    id: rate.id,
    inactive: rate.inactive,
    is_default: rate.is_default,
}))

// The book's default rate (`is_default`).
const DEFAULT_RATE = TAX_IDS.denverCombined

const ACCOUNTS = REFUND_FROM_ACCOUNTS
const CHECKING = REFUND_FROM_ACCOUNT_IDS.checking
const SAVINGS = REFUND_FROM_ACCOUNT_IDS.savings
const UNDEPOSITED = REFUND_FROM_ACCOUNT_IDS.undeposited

function account(id: string): DepositAccountRow {
    const row = ACCOUNTS.find(a => a.id === id)
    if (!row) throw new Error(`no account ${id} in the refund fixture`)
    return row
}

function harborview(): CustomerFill {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the fixture')
    return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        billing_address: row.billing_address,
        terms: 'net_30',
        tax_exempt: false,
        default_tax_rate: TAX_IDS.adamsCombined,
    }
}

function exemptHarborview(): CustomerFill {
    return { ...harborview(), tax_exempt: true }
}

// The posted refund 1001 (Harborview, Check 20417 from 1000 Business Checking, message and
// memo set) and its lines in position order.
function posted1001() {
    const refund = REFUND_RECEIPTS.find(r => r.id === REFUND_RECEIPT_IDS.posted)
    if (!refund) throw new Error('no posted 1001 in the refund receipt fixture')
    const lines = REFUND_RECEIPT_LINES.filter(l => l.refund_receipt === refund.id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error('posted 1001 has no lines in the fixture')
    return { refund, lines }
}

// The posted payout 1005 (part of credit memo 1001) and its lines in position order.
function payout1005() {
    const refund = REFUND_RECEIPTS.find(r => r.id === REFUND_RECEIPT_IDS.payout)
    if (!refund) throw new Error('no payout 1005 in the refund receipt fixture')
    expect(refund.credit_memo).not.toBe('')
    const lines = REFUND_RECEIPT_LINES.filter(l => l.refund_receipt === refund.id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error('payout 1005 has no lines in the fixture')
    return { refund, lines }
}

function storedCells(record: {
    kind: string
    product: string
    description: string
    quantity: number
    rate: number
    percent_ppm: number
    taxable: boolean
}) {
    const { kind, product, description, quantity, rate, percent_ppm, taxable } = record
    return { kind, product, description, quantity, rate, percent_ppm, taxable }
}

function expectSameCellsWithNewIds(
    rows: TableRow[],
    lines: ReturnType<typeof posted1001>['lines']
) {
    expect(rows).toHaveLength(lines.length)
    rows.forEach((row, index) => {
        expect(storedCells(DOCUMENT_LINE_MAPPER.toRecord(row, index))).toEqual(
            storedCells(lines[index])
        )
    })
    const ids = rows.map(row => String(row.id))
    for (const id of ids) expect(id).not.toBe('')
    expect(new Set(ids).size).toBe(ids.length)
    const storedIds = new Set(lines.map(line => line.id))
    expect(ids.filter(id => storedIds.has(id))).toEqual([])
}

// Refund from's default (spec §3.2, Q3): the first active bank account in chart order;
// with no bank account, the first active Undeposited funds account; with neither, ''.
// No setting applies, so `setAccount` is always ''.
describe('refundFromStart', () => {
    it('defaults to the first active bank account, not to Undeposited funds', () => {
        const start = refundFromStart(ACCOUNTS)
        expect(start.defaultId).toBe(CHECKING)
        expect(start.setAccount).toBe('')
        expect([...start.activeIds].sort()).toEqual([CHECKING, SAVINGS, UNDEPOSITED].sort())
    })

    it('skips an inactive bank account', () => {
        const accounts = ACCOUNTS.map(a => (a.id === CHECKING ? { ...a, inactive: true } : a))
        const start = refundFromStart(accounts)
        expect(start.defaultId).toBe(SAVINGS)
        expect(start.activeIds.has(CHECKING)).toBe(false)
    })

    it('defaults to Undeposited funds when the chart has no bank account', () => {
        const start = refundFromStart([account(UNDEPOSITED)])
        expect(start.defaultId).toBe(UNDEPOSITED)
    })

    it('has no default when the chart has neither', () => {
        const start = refundFromStart(NO_REFUND_FROM_ACCOUNTS)
        expect(start.defaultId).toBe('')
        expect(start.activeIds.size).toBe(0)
        expect(start.setAccount).toBe('')
    })
})

describe('newRefundReceiptValues', () => {
    it('with no customer: today, the default Refund from, one empty Item line, no link', () => {
        const values = newRefundReceiptValues({
            today: TODAY,
            customer: null,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            refundFrom: refundFromStart(ACCOUNTS),
        })
        expect(values.customer).toBe('')
        expect(values.bill_to).toBeNull()
        expect(values.email).toBe('')
        expect(values.date).toBe(TODAY)
        expect(values.tax_rate).toBe(DEFAULT_RATE)
        expect(values.payment_method).toBe('')
        expect(values.reference_no).toBe('')
        expect(values.refund_from).toBe(CHECKING)
        expect(values.message).toBe('')
        expect(values.memo).toBe('')
        expect(values.sales_receipt).toBe('')
        expect(values.credit_memo).toBe('')
        const lines = values.lines as TableRow[]
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ kind: 'item', quantity: 1 })
        expect(lines[0].product ?? '').toBe('')
        expect(lines[0].description ?? '').toBe('')
        expect(String(lines[0].id)).not.toBe('')
    })

    it('takes Undeposited funds with no bank account, and empty with neither', () => {
        const undepositedOnly = newRefundReceiptValues({
            today: TODAY,
            customer: null,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            refundFrom: refundFromStart([account(UNDEPOSITED)]),
        })
        expect(undepositedOnly.refund_from).toBe(UNDEPOSITED)
        const none = newRefundReceiptValues({
            today: TODAY,
            customer: null,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            refundFrom: refundFromStart(NO_REFUND_FROM_ACCOUNTS),
        })
        expect(none.refund_from).toBe('')
    })

    it('with a customer (`?customer=`) fills Bill to, Email and Tax as a pick does', () => {
        const customer = harborview()
        const values = newRefundReceiptValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            refundFrom: refundFromStart(ACCOUNTS),
        })
        const fills = customerFills(customer, RATES, TODAY, null)
        expect(values.customer).toBe(customer.id)
        expect(values.bill_to).toEqual(fills.bill_to)
        expect(values.email).toBe(fills.email)
        expect(values.tax_rate).toBe(TAX_IDS.adamsCombined)
        expect(values).not.toHaveProperty('terms')
        expect(values).not.toHaveProperty('due_date')
    })

    it('with an exempt customer turns every line taxable off', () => {
        const customer = exemptHarborview()
        const values = newRefundReceiptValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            refundFrom: refundFromStart(ACCOUNTS),
        })
        expect(values.tax_rate).toBe(customerFills(customer, RATES, TODAY, null).tax_rate)
        const lines = values.lines as TableRow[]
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) expect(line.taxable).toBe(false)
    })
})

describe('REFUND_RECEIPT_DOCUMENT.values.new', () => {
    // Q8: the Books setting "Default message to customer" does not fill a refund receipt.
    it('ignores the default message and takes Refund from from the start', () => {
        const values = REFUND_RECEIPT_DOCUMENT.values.new({
            today: TODAY,
            party: null,
            rates: RATES,
            defaultRateId: DEFAULT_RATE,
            message: DEFAULT_MESSAGE,
            start: { kind: 'refund_receipt', refundFrom: refundFromStart(ACCOUNTS) },
        })
        expect(values.message).toBe('')
        expect(values.date).toBe(TODAY)
        expect((values as { refund_from?: string }).refund_from).toBe(CHECKING)
    })
})

describe('copyRefundReceiptValues', () => {
    it('keeps the customer, the lines (new ids), the tax, the payment method and the message', () => {
        const { refund, lines } = posted1001()
        const values = copyRefundReceiptValues(
            refund,
            lines,
            COPY_DAY,
            harborview(),
            refundFromStart(ACCOUNTS)
        )
        expect(values.customer).toBe(refund.customer)
        expect(values.tax_rate).toBe(refund.tax_rate)
        expect(values.payment_method).toBe(refund.payment_method)
        expect(values.payment_method).toBe('check')
        expect(values.message).toBe(refund.message)
        expect(values.message).not.toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    it('is dated the day given, with no reference, no memo, no link, and replaces nothing', () => {
        const { refund, lines } = posted1001()
        expect(refund.reference_no).not.toBe('')
        expect(refund.memo).not.toBe('')
        expect(refund.sales_receipt).not.toBe('')
        const values = copyRefundReceiptValues(
            refund,
            lines,
            COPY_DAY,
            harborview(),
            refundFromStart(ACCOUNTS)
        )
        expect(values.date).toBe(COPY_DAY)
        expect(values.reference_no).toBe('')
        expect(values.memo).toBe('')
        expect(values.sales_receipt).toBe('')
        expect(values.credit_memo).toBe('')
        expect((values as { replaces?: string }).replaces ?? '').toBe('')
    })

    it('makes a plain refund with no link from a payout', () => {
        const { refund, lines } = payout1005()
        const values = copyRefundReceiptValues(
            refund,
            lines,
            COPY_DAY,
            harborview(),
            refundFromStart(ACCOUNTS)
        )
        expect(values.credit_memo).toBe('')
        expect(values.sales_receipt).toBe('')
    })

    it("keeps the source's Refund from while it is active, else takes the default", () => {
        const { refund, lines } = posted1001()
        const fromSavings = { ...refund, refund_from: SAVINGS }
        const kept = copyRefundReceiptValues(
            fromSavings,
            lines,
            COPY_DAY,
            harborview(),
            refundFromStart(ACCOUNTS)
        )
        expect(kept.refund_from).toBe(SAVINGS)
        const savingsInactive = ACCOUNTS.map(a => (a.id === SAVINGS ? { ...a, inactive: true } : a))
        const replaced = copyRefundReceiptValues(
            fromSavings,
            lines,
            COPY_DAY,
            harborview(),
            refundFromStart(savingsInactive)
        )
        expect(replaced.refund_from).toBe(CHECKING)
    })
})

describe('refundReceiptCorrectionValues', () => {
    it('keeps the sales receipt link of a refund made from one', () => {
        const { refund, lines } = posted1001()
        expect(refund.sales_receipt).not.toBe('')
        const values = refundReceiptCorrectionValues(refund, lines)
        expect(values.sales_receipt).toBe(refund.sales_receipt)
        expect(values.credit_memo).toBe('')
    })

    it('keeps the credit memo link of a payout', () => {
        const { refund, lines } = payout1005()
        const values = refundReceiptCorrectionValues(refund, lines)
        expect(values.credit_memo).toBe(refund.credit_memo)
        expect(values.sales_receipt).toBe('')
    })

    it('keeps every column of the posted refund, memo, reference and date included', () => {
        const { refund, lines } = posted1001()
        const values = refundReceiptCorrectionValues(refund, lines)
        expect(values.replaces).toBe(refund.id)
        expect(values.customer).toBe(refund.customer)
        expect(values.bill_to).toEqual(refund.bill_to)
        expect(values.email).toBe(refund.email)
        expect(values.date).toBe(refund.date)
        expect(values.date).not.toBe(TODAY)
        expect(values.tax_rate).toBe(refund.tax_rate)
        expect(values.payment_method).toBe(refund.payment_method)
        expect(values.reference_no).toBe(refund.reference_no)
        expect(values.reference_no).toBe('20417')
        expect(values.refund_from).toBe(refund.refund_from)
        expect(values.message).toBe(refund.message)
        expect(values.memo).toBe(refund.memo)
        expect(values.memo).not.toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    it('keeps a Refund from that has become inactive since the refund was posted', () => {
        const { refund, lines } = posted1001()
        const values = refundReceiptCorrectionValues({ ...refund, refund_from: SAVINGS }, lines)
        expect(values.refund_from).toBe(SAVINGS)
    })
})

// The customer row a source's form reads (DOCUMENT_PARTIES.customer), with the server's
// columns the fixture leaves out.
function customerRow(id: string): BooksCustomers {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return { ...row, name_key: row.display_name.toLowerCase(), sort_key: '' }
}

function refundStart(accounts: readonly DepositAccountRow[]) {
    return { kind: 'refund_receipt' as const, refundFrom: refundFromStart(accounts) }
}

function fromSourceOf() {
    const fromSource = REFUND_RECEIPT_DOCUMENT.values.fromSource
    if (!fromSource) throw new Error('the refund receipt kind has no fromSource')
    return fromSource
}

// "Refund" on sales receipt 1004: Check, deposited to 1200 Undeposited funds, with a
// reference no., a message and a memo the refund does not take.
function receipt1004() {
    const receipt = SALES_RECEIPTS.find(r => r.id === SALES_RECEIPT_IDS.posted)
    if (!receipt) throw new Error('no sales receipt 1004 in the fixture')
    const lines = SALES_RECEIPT_LINES.filter(l => l.sales_receipt === receipt.id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error('sales receipt 1004 has no lines in the fixture')
    return { receipt, lines }
}

// "Refund credit" on credit memo 1001 (Harborview, dated 2026-11-10, Denver combined).
function memo1001() {
    const memo = CREDIT_MEMOS.find(m => m.id === CREDIT_MEMO_IDS.posted)
    if (!memo) throw new Error('no credit memo 1001 in the fixture')
    const lines = CREDIT_MEMO_LINES.filter(l => l.credit_memo === memo.id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error('credit memo 1001 has no lines in the fixture')
    return { memo, lines }
}

function expectCopiedLines(
    rows: TableRow[],
    lines: ReadonlyArray<Parameters<typeof storedCells>[0] & { id: string }>
) {
    expect(rows).toHaveLength(lines.length)
    rows.forEach((row, index) => {
        expect(storedCells(DOCUMENT_LINE_MAPPER.toRecord(row, index)), `line ${index + 1}`).toEqual(
            storedCells(lines[index])
        )
    })
    const storedIds = new Set(lines.map(line => line.id))
    expect(rows.map(row => String(row.id)).filter(id => storedIds.has(id))).toEqual([])
}

describe('refundValuesFromSalesReceipt (fromSource of a sales receipt)', () => {
    it("takes the receipt's customer, Bill to, Email, Tax, payment method and every line", () => {
        const { receipt, lines } = receipt1004()
        const values = fromSourceOf()(
            { key: 'sales_receipt', row: receipt },
            lines,
            TODAY,
            customerRow(receipt.customer),
            refundStart(ACCOUNTS)
        )
        expect(values.customer).toBe(receipt.customer)
        expect(values.bill_to).toEqual(receipt.bill_to)
        expect(values.email).toBe(receipt.email)
        expect(values.tax_rate).toBe(receipt.tax_rate)
        expect(values.payment_method).toBe('check')
        expectCopiedLines(values.lines as TableRow[], lines)
    })

    it('is dated today with no reference no., message or memo, and names the receipt', () => {
        const { receipt, lines } = receipt1004()
        expect(receipt.reference_no).not.toBe('')
        expect(receipt.message).not.toBe('')
        expect(receipt.memo).not.toBe('')
        const values = fromSourceOf()(
            { key: 'sales_receipt', row: receipt },
            lines,
            TODAY,
            customerRow(receipt.customer),
            refundStart(ACCOUNTS)
        )
        expect(values.date).toBe(TODAY)
        expect(values.reference_no).toBe('')
        expect(values.message).toBe('')
        expect(values.memo).toBe('')
        expect(values.sales_receipt).toBe(receipt.id)
        expect(values.credit_memo ?? '').toBe('')
        expect(values.replaces ?? '').toBe('')
    })

    it("refunds from the receipt's deposit account while it is active, else the default", () => {
        const { receipt, lines } = receipt1004()
        expect(receipt.deposit_to).toBe(UNDEPOSITED)
        const kept = fromSourceOf()(
            { key: 'sales_receipt', row: receipt },
            lines,
            TODAY,
            customerRow(receipt.customer),
            refundStart(ACCOUNTS)
        )
        expect(kept.refund_from).toBe(UNDEPOSITED)
        const undepositedInactive = ACCOUNTS.map(a =>
            a.id === UNDEPOSITED ? { ...a, inactive: true } : a
        )
        const replaced = fromSourceOf()(
            { key: 'sales_receipt', row: receipt },
            lines,
            TODAY,
            customerRow(receipt.customer),
            refundStart(undepositedInactive)
        )
        expect(replaced.refund_from).toBe(CHECKING)
    })

    it('starts with no customer from a walk-in receipt', () => {
        const walkIn = SALES_RECEIPTS.find(r => r.id === SALES_RECEIPT_IDS.walkIn)
        if (!walkIn) throw new Error('no walk-in sales receipt in the fixture')
        const lines = SALES_RECEIPT_LINES.filter(l => l.sales_receipt === walkIn.id).sort(
            (a, b) => a.position - b.position
        )
        const values = fromSourceOf()(
            { key: 'sales_receipt', row: walkIn },
            lines,
            TODAY,
            null,
            refundStart(ACCOUNTS)
        )
        expect(values.customer).toBe('')
        expect(values.payment_method).toBe('cash')
        expect(values.refund_from).toBe(walkIn.deposit_to)
        expect(values.sales_receipt).toBe(walkIn.id)
    })
})

describe('refundValuesFromCreditMemo (fromSource of a credit memo)', () => {
    it("takes the memo's customer, Bill to, Email, Tax and every line, and names the memo", () => {
        const { memo, lines } = memo1001()
        const values = fromSourceOf()(
            { key: 'credit_memo', row: memo },
            lines,
            TODAY,
            customerRow(memo.customer),
            refundStart(ACCOUNTS)
        )
        expect(values.customer).toBe(memo.customer)
        expect(values.bill_to).toEqual(memo.bill_to)
        expect(values.email).toBe(memo.email)
        expect(values.tax_rate).toBe(memo.tax_rate)
        expectCopiedLines(values.lines as TableRow[], lines)
        expect(values.credit_memo).toBe(memo.id)
        expect(values.sales_receipt ?? '').toBe('')
        expect(values.replaces ?? '').toBe('')
    })

    it('takes the default Refund from, no payment method, no reference, message or memo', () => {
        const { memo, lines } = memo1001()
        expect(memo.message).not.toBe('')
        const values = fromSourceOf()(
            { key: 'credit_memo', row: memo },
            lines,
            TODAY,
            customerRow(memo.customer),
            refundStart(ACCOUNTS)
        )
        expect(values.refund_from).toBe(CHECKING)
        expect(values.payment_method).toBe('')
        expect(values.reference_no).toBe('')
        expect(values.message).toBe('')
        expect(values.memo).toBe('')
    })

    it("is dated today, or the memo's date when that is later", () => {
        const { memo, lines } = memo1001()
        expect(memo.date < TODAY).toBe(true)
        const today = fromSourceOf()(
            { key: 'credit_memo', row: memo },
            lines,
            TODAY,
            customerRow(memo.customer),
            refundStart(ACCOUNTS)
        )
        expect(today.date).toBe(TODAY)
        const later = '2026-11-25'
        const memoDay = fromSourceOf()(
            { key: 'credit_memo', row: { ...memo, date: later } },
            lines,
            TODAY,
            customerRow(memo.customer),
            refundStart(ACCOUNTS)
        )
        expect(memoDay.date).toBe(later)
    })
})
