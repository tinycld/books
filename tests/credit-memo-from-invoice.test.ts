import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import {
    CREDIT_MEMO_FROM_INVOICE,
    CREDIT_MEMO_FROM_INVOICE_LINES,
    CREDIT_MEMO_TODAY,
} from '../tinycld/books/lib/credit-memo-form-fixture'
import { creditMemoValuesFromInvoice } from '../tinycld/books/lib/credit-memo-values'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import type { CustomerFill } from '../tinycld/books/lib/document-fills'
import { DOCUMENT_LINE_MAPPER } from '../tinycld/books/lib/document-line-columns'
import { type DocumentTax, documentTotals } from '../tinycld/books/lib/document-lines'
import { INVOICE_LINES, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import { TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

// "Create credit memo" on a posted invoice (spec §3.2, Q20): the new form starts with the
// invoice's customer, Bill to, Email, Tax and a copy of every line (new ids), today's
// date, an empty message and an empty memo, and names the invoice in `invoice`.

const TODAY = CREDIT_MEMO_TODAY

// The fixture's source invoice (the one CREDIT_MEMO_FROM_INVOICE is made from) and its
// lines in position order.
function sourceInvoice() {
    const invoice = INVOICES.find(row => row.id === CREDIT_MEMO_FROM_INVOICE.invoice)
    if (!invoice) throw new Error('no source invoice for CREDIT_MEMO_FROM_INVOICE')
    const lines = INVOICE_LINES.filter(line => line.invoice === invoice.id).sort(
        (a, b) => a.position - b.position
    )
    return { invoice, lines }
}

function fillOf(customerId: string): CustomerFill {
    const row = CUSTOMERS.find(c => c.id === customerId)
    if (!row) throw new Error(`no customer ${customerId} in the fixture`)
    return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        billing_address: row.billing_address,
        terms: 'net_30',
        tax_exempt: false,
        default_tax_rate: '',
    }
}

function taxOf(rateId: string): DocumentTax {
    if (rateId === '') return null
    const row = TAX_RATE_ROWS.find(r => r.id === rateId)
    if (!row) throw new Error(`unknown tax rate ${rateId}`)
    const ids = row.type === 'group' ? row.components : [row.id]
    return {
        components: ids.map(id => {
            const rate = TAX_RATE_ROWS.find(r => r.id === id)
            if (!rate) throw new Error(`unknown tax component ${id}`)
            return { id, ppm: rate.rate_ppm }
        }),
    }
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

function fromInvoice() {
    const { invoice, lines } = sourceInvoice()
    const values = creditMemoValuesFromInvoice(invoice, lines, TODAY, fillOf(invoice.customer))
    return { invoice, lines, values }
}

describe('creditMemoValuesFromInvoice', () => {
    it('reads the fixture source invoice and its seven lines', () => {
        const { invoice, lines } = sourceInvoice()
        expect(invoice.status).toBe('posted')
        expect(lines).toHaveLength(7)
        expect(CREDIT_MEMO_FROM_INVOICE_LINES).toHaveLength(7)
    })

    it('takes the customer, Bill to, Email and Tax of the invoice', () => {
        const { invoice, values } = fromInvoice()
        expect(values.customer).toBe(invoice.customer)
        expect(values.bill_to).toEqual(invoice.bill_to)
        expect(values.email).toBe(invoice.email)
        expect(values.tax_rate).toBe(invoice.tax_rate)
        expect(values.customer).toBe(CREDIT_MEMO_FROM_INVOICE.customer)
        expect(values.bill_to).toEqual(CREDIT_MEMO_FROM_INVOICE.bill_to)
        expect(values.email).toBe(CREDIT_MEMO_FROM_INVOICE.email)
        expect(values.tax_rate).toBe(CREDIT_MEMO_FROM_INVOICE.tax_rate)
    })

    it('copies every line, in order, with its kind, product, description, quantity, rate or percent and taxable, under new ids', () => {
        const { lines, values } = fromInvoice()
        const rows = values.lines as TableRow[]
        expect(rows).toHaveLength(lines.length)
        rows.forEach((row, index) => {
            expect(
                storedCells(DOCUMENT_LINE_MAPPER.toRecord(row, index)),
                `line ${index + 1}`
            ).toEqual(storedCells(lines[index]))
        })
        const ids = rows.map(row => String(row.id))
        for (const id of ids) expect(id).not.toBe('')
        expect(new Set(ids).size).toBe(ids.length)
        const storedIds = new Set(lines.map(line => line.id))
        expect(ids.filter(id => storedIds.has(id))).toEqual([])
    })

    it('is dated today with an empty message and an empty memo', () => {
        const { invoice, values } = fromInvoice()
        expect(invoice.message).not.toBe('')
        expect(values.date).toBe(TODAY)
        expect(values.message).toBe('')
        expect(values.memo).toBe('')
    })

    it('names the invoice in invoice, and has no terms, due date, estimate or replaces', () => {
        const { invoice, values } = fromInvoice()
        expect(values.invoice).toBe(invoice.id)
        expect(values).not.toHaveProperty('terms')
        expect(values).not.toHaveProperty('due_date')
        expect(values).not.toHaveProperty('estimate')
        expect(values).not.toHaveProperty('replaces')
    })

    it('totals 2,069.70, tax 42.07 and 2,111.77, as the invoice', () => {
        const { values } = fromInvoice()
        const rows = values.lines as TableRow[]
        const totals = documentTotals(
            rows.map((row, index) => {
                const line = DOCUMENT_LINE_MAPPER.toRecord(row, index)
                return {
                    kind: line.kind,
                    quantity: line.quantity,
                    rate: line.rate,
                    percentPpm: line.percent_ppm,
                    taxable: line.taxable,
                }
            }),
            taxOf(values.tax_rate ?? '')
        )
        expect({
            subtotal: totals.subtotal,
            tax: totals.taxTotal,
            total: totals.total,
        }).toEqual({ subtotal: 206_970, tax: 4_207, total: 211_177 })
    })

    // The form shows an inactive customer as the Customer picker shows a correction's;
    // Post is refused by the server ("<name> is inactive. Choose an active customer.").
    it('keeps an inactive customer', () => {
        const { invoice, lines } = sourceInvoice()
        const oldMill = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.oldMill)
        expect(oldMill?.inactive).toBe(true)
        const values = creditMemoValuesFromInvoice(
            { ...invoice, customer: CUSTOMER_IDS.oldMill },
            lines,
            TODAY,
            fillOf(CUSTOMER_IDS.oldMill)
        )
        expect(values.customer).toBe(CUSTOMER_IDS.oldMill)
    })
})
