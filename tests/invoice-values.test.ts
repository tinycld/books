import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { dueDateFor } from '../tinycld/books/lib/document-dates'
import { type CustomerFill, customerFills } from '../tinycld/books/lib/document-fills'
import { DOCUMENT_LINE_MAPPER } from '../tinycld/books/lib/document-line-columns'
import { type DocumentTax, documentTotals } from '../tinycld/books/lib/document-lines'
import { documentLinesForSave, documentTotalsOf } from '../tinycld/books/lib/document-values'
import { INVOICE_IDS, INVOICE_LINES, INVOICES } from '../tinycld/books/lib/invoice-form-fixture'
import {
    copyInvoiceValues,
    type InvoiceFormValues,
    invoiceCorrectionValues,
    newInvoiceValues,
} from '../tinycld/books/lib/invoice-values'
import { TAX_IDS, TAX_RATE_ROWS, TAX_RATES } from '../tinycld/books/lib/tax-rates-fixture'

const TODAY = '2026-11-04'

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

function row(cells: Record<string, unknown>, id: string): TableRow {
    return { id, ...cells }
}

describe('newInvoiceValues', () => {
    it('starts dated today, due today, with one empty Item line of qty 1', () => {
        const values = newInvoiceValues({
            today: TODAY,
            rates: RATES,
            defaultRateId: TAX_IDS.denverCombined,
        })
        expect(values.date).toBe(TODAY)
        expect(values.due_date).toBe(TODAY)
        const lines = values.lines as TableRow[]
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ kind: 'item', quantity: 1 })
        expect(typeof lines[0].id).toBe('string')
        expect(lines[0].id).not.toBe('')
        expect(lines[0].product ?? '').toBe('')
        expect(lines[0].description ?? '').toBe('')
    })

    it('with a customer, fills the header as customerFills does', () => {
        const customer = harborview()
        const values = newInvoiceValues({
            today: TODAY,
            customer,
            rates: RATES,
            defaultRateId: TAX_IDS.denverCombined,
        })
        const fills = customerFills(customer, RATES, TODAY, null)
        expect(values.customer).toBe(customer.id)
        expect(values.bill_to).toEqual(fills.bill_to)
        expect(values.email).toBe(fills.email)
        expect(values.terms).toBe(fills.terms)
        expect(values.tax_rate).toBe(fills.tax_rate)
        expect(values.tax_rate).toBe(TAX_IDS.adamsCombined)
        expect(values.due_date).toBe(fills.due_date)
        expect(values.due_date).toBe('2026-12-04')
        expect(values.date).toBe(TODAY)
    })
})

describe('invoiceLinesForSave', () => {
    const filled = row(
        { kind: 'item', product: 'prodbookkeep001', description: '', quantity: 1, rate: '10.00' },
        'rowfilled00001'
    )
    const empty = row(
        { kind: 'item', product: '', description: '', quantity: 1, rate: '' },
        'rowempty000001'
    )
    const emptyNulls = row(
        { kind: 'item', product: null, description: null, quantity: 1, rate: null },
        'rowemptynull01'
    )

    it('drops a trailing Item line with no product and no description', () => {
        expect(documentLinesForSave([filled, empty])).toEqual([filled])
        expect(documentLinesForSave([filled, emptyNulls])).toEqual([filled])
    })

    it('keeps a trailing Item line that has a description', () => {
        const described = row(
            { kind: 'item', product: '', description: 'Travel', quantity: 1, rate: '' },
            'rowdescribed01'
        )
        expect(documentLinesForSave([filled, described])).toEqual([filled, described])
    })

    it('keeps an empty Item line that is not last', () => {
        expect(documentLinesForSave([empty, filled])).toEqual([empty, filled])
    })

    it('keeps a trailing line of another kind', () => {
        const subtotal = row({ kind: 'subtotal', amount: null }, 'rowsubtotal001')
        expect(documentLinesForSave([filled, subtotal])).toEqual([filled, subtotal])
    })
})

describe('invoiceTotalsOf', () => {
    const ppmOf = (id: string) => {
        const rate = TAX_RATES.find(r => r.id === id)
        if (!rate) throw new Error(`no rate ${id}`)
        return rate.rate_ppm
    }
    const denver: DocumentTax = {
        components: [TAX_IDS.state, TAX_IDS.rtd, TAX_IDS.denverCity].map(id => ({
            id,
            ppm: ppmOf(id),
        })),
    }

    it('equals documentTotals over the parsed rows (rate text to cents, percent text to ppm)', () => {
        const lines = [
            row(
                {
                    kind: 'item',
                    product: 'a',
                    description: '',
                    quantity: 2,
                    rate: '189.00',
                    taxable: true,
                },
                'rowline0000001'
            ),
            row(
                {
                    kind: 'item',
                    product: 'b',
                    description: '',
                    quantity: 1.5,
                    rate: '1,234.50',
                    taxable: false,
                },
                'rowline0000002'
            ),
            row({ kind: 'subtotal', amount: null }, 'rowline0000003'),
            row(
                { kind: 'percent', product: 'd', description: '', percent: '-12.5', taxable: true },
                'rowline0000004'
            ),
            row({ kind: 'description', description: 'Notes' }, 'rowline0000005'),
        ]
        const values = {
            ...newInvoiceValues({ today: TODAY, rates: RATES, defaultRateId: '' }),
            lines,
        } as InvoiceFormValues
        const expected = documentTotals(
            [
                { kind: 'item', quantity: 2, rate: 18_900, percentPpm: 0, taxable: true },
                { kind: 'item', quantity: 1.5, rate: 123_450, percentPpm: 0, taxable: false },
                { kind: 'subtotal', quantity: 0, rate: 0, percentPpm: 0, taxable: false },
                { kind: 'percent', quantity: 0, rate: 0, percentPpm: -125_000, taxable: true },
                { kind: 'description', quantity: 0, rate: 0, percentPpm: 0, taxable: false },
            ],
            denver
        )
        const totals = documentTotalsOf(values, denver)
        expect(totals).toEqual(expected)
        // 37 800 + 185 175 = 222 975; -12.5% of it is -27 872 (half away from zero).
        expect(totals.amounts).toEqual([37_800, 185_175, 222_975, -27_872, null])
        expect(totals.subtotal).toBe(195_103)
    })

    it('with no tax has no tax line and a total equal to the subtotal', () => {
        const values = {
            ...newInvoiceValues({ today: TODAY, rates: RATES, defaultRateId: '' }),
            lines: [
                row(
                    {
                        kind: 'item',
                        product: 'a',
                        description: '',
                        quantity: 2,
                        rate: '189.00',
                        taxable: true,
                    },
                    'rowline0000011'
                ),
            ],
        } as InvoiceFormValues
        const totals = documentTotalsOf(values, null)
        expect(totals.taxLines).toEqual([])
        expect(totals.total).toBe(37_800)
    })
})

// Posted 1004 (every line kind, Net 30, Denver combined) and its lines in position order.
function posted1004() {
    const invoice = INVOICES.find(i => i.id === INVOICE_IDS.posted)
    if (!invoice) throw new Error('no posted 1004 in the invoice fixture')
    const lines = INVOICE_LINES.filter(l => l.invoice === invoice.id).sort(
        (a, b) => a.position - b.position
    )
    if (lines.length === 0) throw new Error('posted 1004 has no lines in the fixture')
    return { invoice, lines }
}

// A row's cells as the save writes them, so a copied row is compared with the stored line
// by what it would store, whatever display form the cells take.
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
    lines: ReturnType<typeof posted1004>['lines']
) {
    expect(rows).toHaveLength(lines.length)
    rows.forEach((row, index) => {
        expect(storedCells(DOCUMENT_LINE_MAPPER.toRecord(row, index))).toEqual(
            storedCells(lines[index])
        )
    })
    const ids = rows.map(row => row.id)
    for (const id of ids) {
        expect(typeof id).toBe('string')
        expect(id).not.toBe('')
    }
    expect(new Set(ids).size).toBe(ids.length)
    const storedIds = new Set(lines.map(line => line.id))
    expect(ids.filter(id => storedIds.has(String(id)))).toEqual([])
}

// Harborview after 1004 was posted: it moved, changed its billing email and its terms,
// and has another default tax rate. 1004's snapshot still holds the old values.
function movedHarborview(): CustomerFill {
    return {
        ...harborview(),
        email: 'ap@harborview.example',
        billing_address: {
            line1: '77 Pier Road',
            line2: '',
            city: 'Tacoma',
            region: 'WA',
            postal_code: '98402',
            country: 'United States',
        },
        terms: 'net_15',
        default_tax_rate: TAX_IDS.adamsCombined,
    }
}

describe('copyInvoiceValues', () => {
    const COPY_DAY = '2026-11-09'

    it('keeps the customer, tax, message and every line cell, with new line ids', () => {
        const { invoice, lines } = posted1004()
        const customer = movedHarborview()
        // The customer's own default rate differs, so the source's tax is what is kept.
        expect(customer.default_tax_rate).not.toBe(invoice.tax_rate)
        const values = copyInvoiceValues(invoice, lines, COPY_DAY, customer)
        expect(values.customer).toBe(invoice.customer)
        expect(values.tax_rate).toBe(invoice.tax_rate)
        expect(values.message).toBe(invoice.message)
        expect(values.message).not.toBe('')
        expectSameCellsWithNewIds(values.lines, lines)
    })

    it("is dated the day given and due by the customer's terms from it", () => {
        const { invoice, lines } = posted1004()
        const customer = harborview()
        expect(customer.terms).toBe('net_30')
        const values = copyInvoiceValues(invoice, lines, COPY_DAY, customer)
        expect(values.date).toBe(COPY_DAY)
        expect(values.due_date).toBe(dueDateFor(COPY_DAY, 'net_30'))
        expect(values.due_date).toBe('2026-12-09')
    })

    it('has no memo and replaces nothing', () => {
        const { invoice, lines } = posted1004()
        expect(invoice.memo).not.toBe('')
        const values = copyInvoiceValues(invoice, lines, COPY_DAY, harborview())
        expect(values.memo).toBe('')
        expect(values.replaces ?? '').toBe('')
    })

    it("takes Bill to, Email and Terms from the customer's current record, not the source's snapshot", () => {
        const { invoice, lines } = posted1004()
        const customer = movedHarborview()
        expect(customer.id).toBe(invoice.customer)
        expect(customer.billing_address).not.toEqual(invoice.bill_to)
        expect(customer.email).not.toBe(invoice.email)
        expect(customer.terms).not.toBe(invoice.terms)
        const values = copyInvoiceValues(invoice, lines, COPY_DAY, customer)
        const fills = customerFills(customer, RATES, COPY_DAY, null)
        expect(values.bill_to).toEqual(fills.bill_to)
        expect(values.bill_to).toEqual(customer.billing_address)
        expect(values.email).toBe(fills.email)
        expect(values.email).toBe('ap@harborview.example')
        expect(values.terms).toBe(fills.terms)
        expect(values.terms).toBe('net_15')
    })

    it("is due by the customer's current terms, not the source's", () => {
        const { invoice, lines } = posted1004()
        expect(invoice.terms).toBe('net_30')
        const values = copyInvoiceValues(invoice, lines, COPY_DAY, movedHarborview())
        expect(values.date).toBe(COPY_DAY)
        expect(values.due_date).toBe(dueDateFor(COPY_DAY, 'net_15'))
        expect(values.due_date).toBe('2026-11-24')
    })
})

describe('correctionValues', () => {
    it('replaces the invoice and keeps its date, due date and memo', () => {
        const { invoice, lines } = posted1004()
        const values = invoiceCorrectionValues(invoice, lines)
        expect(values.replaces).toBe(invoice.id)
        expect(values.date).toBe(invoice.date)
        expect(values.due_date).toBe(invoice.due_date)
        expect(values.memo).toBe(invoice.memo)
    })

    it('keeps the customer, tax, message and every line cell, with new line ids', () => {
        const { invoice, lines } = posted1004()
        const values = invoiceCorrectionValues(invoice, lines)
        expect(values.customer).toBe(invoice.customer)
        expect(values.tax_rate).toBe(invoice.tax_rate)
        expect(values.message).toBe(invoice.message)
        expectSameCellsWithNewIds(values.lines, lines)
    })
})
