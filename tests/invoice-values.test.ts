import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { type DocumentTax, documentTotals } from '../tinycld/books/lib/document-lines'
import { type CustomerFill, customerFills } from '../tinycld/books/lib/invoice-fills'
import {
    type InvoiceFormValues,
    invoiceLinesForSave,
    invoiceTotalsOf,
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
        expect(invoiceLinesForSave([filled, empty])).toEqual([filled])
        expect(invoiceLinesForSave([filled, emptyNulls])).toEqual([filled])
    })

    it('keeps a trailing Item line that has a description', () => {
        const described = row(
            { kind: 'item', product: '', description: 'Travel', quantity: 1, rate: '' },
            'rowdescribed01'
        )
        expect(invoiceLinesForSave([filled, described])).toEqual([filled, described])
    })

    it('keeps an empty Item line that is not last', () => {
        expect(invoiceLinesForSave([empty, filled])).toEqual([empty, filled])
    })

    it('keeps a trailing line of another kind', () => {
        const subtotal = row({ kind: 'subtotal', amount: null }, 'rowsubtotal001')
        expect(invoiceLinesForSave([filled, subtotal])).toEqual([filled, subtotal])
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
        const totals = invoiceTotalsOf(values, denver)
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
        const totals = invoiceTotalsOf(values, null)
        expect(totals.taxLines).toEqual([])
        expect(totals.total).toBe(37_800)
    })
})
