import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { BILL_CURRENCY, BILL_IDS, BILL_LINES } from '../tinycld/books/lib/bill-form-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import type { CustomerFill } from '../tinycld/books/lib/document-fills'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import { shownDocumentTotals } from '../tinycld/books/lib/document-tax'
import { defaultMessageFor } from '../tinycld/books/lib/document-values'
import { INVOICE_IDS, INVOICE_LINES, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import { copyInvoiceValues, newInvoiceValues } from '../tinycld/books/lib/invoice-values'
import { centsToText } from '../tinycld/books/lib/money-text'
import {
    type DocumentLineTable,
    SALES_LINE_TABLES,
} from '../tinycld/books/lib/sales-document-kinds'
import {
    DEPOSIT_ACCOUNT_IDS,
    SALES_RECEIPT_IDS,
    SALES_RECEIPT_LINES,
    SALES_RECEIPTS,
} from '../tinycld/books/lib/sales-receipt-form-fixture'
import {
    copySalesReceiptValues,
    newSalesReceiptValues,
    salesReceiptCorrectionValues,
} from '../tinycld/books/lib/sales-receipt-values'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

// Spec §3.5 / §3.11: a new blank form (new, Post & new, `?customer=`) starts with the
// Books setting "Default message to customer"; a copy keeps its source's message and a
// correction its original's. The invoice gets the same fill.

const TODAY = '2026-11-11'
const COPY_DAY = '2026-11-12'
const DEFAULT_MESSAGE = 'Thank you for your business!'
const SOURCE_MESSAGE = 'Paid in full at the counter.'

const RATES = TAX_RATE_ROWS.map(rate => ({
    id: rate.id,
    inactive: rate.inactive,
    is_default: rate.is_default,
}))

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

// A posted source with its own message, which differs from the default.
function postedInvoice() {
    const invoice = INVOICES.find(i => i.id === INVOICE_IDS.posted)
    if (!invoice) throw new Error('no posted 1004 in the invoice fixture')
    const lines = INVOICE_LINES.filter(l => l.invoice === invoice.id)
    return { invoice: { ...invoice, message: SOURCE_MESSAGE }, lines }
}

function postedReceipt() {
    const receipt = SALES_RECEIPTS.find(r => r.id === SALES_RECEIPT_IDS.posted)
    if (!receipt) throw new Error('no posted 1004 in the sales receipt fixture')
    const lines = SALES_RECEIPT_LINES.filter(l => l.sales_receipt === receipt.id)
    return { receipt: { ...receipt, message: SOURCE_MESSAGE }, lines }
}

describe('defaultMessageFor', () => {
    it('is the setting text', () => {
        expect(defaultMessageFor({ default_customer_message: 'Thanks' })).toBe('Thanks')
    })

    it('is empty while the settings row is not there', () => {
        expect(defaultMessageFor(undefined)).toBe('')
    })

    it('is empty when the setting is empty', () => {
        expect(defaultMessageFor({ default_customer_message: '' })).toBe('')
    })
})

describe('a new blank form starts with the default message', () => {
    it('newInvoiceValues, with and without a customer', () => {
        const blank = newInvoiceValues({
            today: TODAY,
            rates: RATES,
            defaultRateId: TAX_IDS.denverCombined,
            message: DEFAULT_MESSAGE,
        })
        expect(blank.message).toBe(DEFAULT_MESSAGE)
        const forCustomer = newInvoiceValues({
            today: TODAY,
            customer: harborview(),
            rates: RATES,
            defaultRateId: TAX_IDS.denverCombined,
            message: DEFAULT_MESSAGE,
        })
        expect(forCustomer.message).toBe(DEFAULT_MESSAGE)
    })

    it('newSalesReceiptValues, with and without a customer', () => {
        const blank = newSalesReceiptValues({
            today: TODAY,
            rates: RATES,
            defaultRateId: TAX_IDS.denverCombined,
            depositDefault: DEPOSIT_ACCOUNT_IDS.undeposited,
            message: DEFAULT_MESSAGE,
        })
        expect(blank.message).toBe(DEFAULT_MESSAGE)
        const forCustomer = newSalesReceiptValues({
            today: TODAY,
            customer: harborview(),
            rates: RATES,
            defaultRateId: TAX_IDS.denverCombined,
            depositDefault: DEPOSIT_ACCOUNT_IDS.undeposited,
            message: DEFAULT_MESSAGE,
        })
        expect(forCustomer.message).toBe(DEFAULT_MESSAGE)
    })

    it('is empty when the setting is empty', () => {
        const receipt = newSalesReceiptValues({
            today: TODAY,
            rates: RATES,
            defaultRateId: TAX_IDS.denverCombined,
            depositDefault: DEPOSIT_ACCOUNT_IDS.undeposited,
            message: '',
        })
        expect(receipt.message).toBe('')
    })
})

// The copy and correction values take no default message: they keep their source's.
describe("a copy and a correction keep their source's message", () => {
    it("copyInvoiceValues keeps the source's message", () => {
        const { invoice, lines } = postedInvoice()
        const values = copyInvoiceValues(invoice, lines, COPY_DAY, harborview())
        expect(values.message).toBe(SOURCE_MESSAGE)
        expect(values.message).not.toBe(DEFAULT_MESSAGE)
    })

    it("copySalesReceiptValues keeps the source's message", () => {
        const { receipt, lines } = postedReceipt()
        const values = copySalesReceiptValues(receipt, lines, COPY_DAY, harborview(), {
            setAccount: '',
            activeIds: new Set([DEPOSIT_ACCOUNT_IDS.undeposited]),
            defaultId: DEPOSIT_ACCOUNT_IDS.undeposited,
        })
        expect(values.message).toBe(SOURCE_MESSAGE)
        expect(values.message).not.toBe(DEFAULT_MESSAGE)
    })

    it("salesReceiptCorrectionValues keeps the original's message", () => {
        const { receipt, lines } = postedReceipt()
        expect(salesReceiptCorrectionValues(receipt, lines).message).toBe(SOURCE_MESSAGE)
    })
})

// Totals over several line tables (plan checkpoint 2, Do 4; spec §3.5). BILL_KIND lands in
// checkpoint 3, so the bill's two tables are a local list of the same shape.
const BILL_TABLES: readonly DocumentLineTable[] = [
    {
        key: 'account_lines',
        rowLabel: 'Account line',
        heading: 'Account details',
        subtotal: { label: 'Account lines', testId: 'total-account-lines' },
    },
    {
        key: 'item_lines',
        rowLabel: 'Product line',
        heading: 'Product and service details',
        subtotal: { label: 'Products and services', testId: 'total-item-lines' },
    },
]

// The 1002 fixture bill's lines as the form holds them: an account line's Amount and an
// item line's Rate are typed money text.
function bill1002Rows() {
    const lines = BILL_LINES.filter(line => line.bill === BILL_IDS.posted).sort(
        (a, b) => a.position - b.position
    )
    const accountRows: TableRow[] = lines
        .filter(line => line.kind === 'account')
        .map(line => ({
            id: line.id,
            kind: 'account',
            account: line.account_number,
            description: line.description,
            amount: centsToText(line.amount).replace(/,/g, ''),
        }))
    const itemRows: TableRow[] = lines
        .filter(line => line.kind === 'item')
        .map(line => ({
            id: line.id,
            kind: 'item',
            product: line.product,
            description: line.description,
            quantity: line.quantity,
            rate: centsToText(line.rate).replace(/,/g, ''),
            amount: null,
        }))
    return { accountRows, itemRows }
}

describe('shownDocumentTotals over several line tables', () => {
    it('gives one total over both tables, a subtotal row per table, and no Subtotal', () => {
        const { accountRows, itemRows } = bill1002Rows()
        const shown = shownDocumentTotals(
            { account_lines: accountRows, item_lines: itemRows },
            null,
            BILL_CURRENCY,
            BILL_TABLES
        )
        expect(shown?.total).toBe(90_995)
        expect(shown?.subtotal).toBeNull()
        expect(shown?.tableSubtotals).toEqual([
            { label: 'Account lines', amount: '$148.55', testId: 'total-account-lines' },
            { label: 'Products and services', amount: '$761.40', testId: 'total-item-lines' },
        ])
    })

    it('gives no subtotal row for a table with no line that has an amount', () => {
        const { accountRows } = bill1002Rows()
        const shown = shownDocumentTotals(
            { account_lines: accountRows, item_lines: [] },
            null,
            BILL_CURRENCY,
            BILL_TABLES
        )
        expect(shown?.total).toBe(14_855)
        expect(shown?.tableSubtotals).toEqual([
            { label: 'Account lines', amount: '$148.55', testId: 'total-account-lines' },
        ])
    })

    // A table whose only line has a zero amount has a line, but none with an amount.
    it('gives no subtotal row for a table whose only line has a zero amount', () => {
        const { accountRows, itemRows } = bill1002Rows()
        const zeroAccount: TableRow = {
            id: 'rowzeroaccount1',
            kind: 'account',
            account: '6200',
            description: 'Nothing yet',
            amount: '0.00',
        }
        const zeroItem: TableRow = {
            id: 'rowzeroitem0001',
            kind: 'item',
            product: itemRows[0]?.product ?? '',
            description: 'Nothing yet',
            quantity: 0,
            rate: '5.00',
            amount: null,
        }
        const noAccountAmount = shownDocumentTotals(
            { account_lines: [zeroAccount], item_lines: itemRows },
            null,
            BILL_CURRENCY,
            BILL_TABLES
        )
        expect(noAccountAmount?.tableSubtotals).toEqual([
            { label: 'Products and services', amount: '$761.40', testId: 'total-item-lines' },
        ])
        const noItemAmount = shownDocumentTotals(
            { account_lines: accountRows, item_lines: [zeroItem] },
            null,
            BILL_CURRENCY,
            BILL_TABLES
        )
        expect(noItemAmount?.tableSubtotals).toEqual([
            { label: 'Account lines', amount: '$148.55', testId: 'total-account-lines' },
        ])
    })

    it("returns for an invoice's single table what it returned before", () => {
        const item: TableRow = {
            id: 'rowitem00000001',
            kind: 'item',
            product: 'prodbookkeep001',
            description: '',
            quantity: 2,
            rate: '100.00',
            amount: null,
            taxable: true,
        }
        const tax = { components: [{ id: 'taxcomponent001', ppm: 87_100 }] }
        const shown = shownDocumentTotals({ lines: [item] }, tax, 'USD', SALES_LINE_TABLES)
        expect(shown).toEqual(
            documentTotals(
                [{ kind: 'item', quantity: 2, rate: 10_000, percentPpm: 0, taxable: true }],
                tax
            )
        )
    })
})
