import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import type { CustomerFill } from '../tinycld/books/lib/document-fills'
import { defaultMessageFor } from '../tinycld/books/lib/document-values'
import { INVOICE_IDS, INVOICE_LINES, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import { copyInvoiceValues, newInvoiceValues } from '../tinycld/books/lib/invoice-values'
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
