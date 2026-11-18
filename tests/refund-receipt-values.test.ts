import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { REFUND_RECEIPT_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
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
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

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
