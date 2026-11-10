import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import { INVOICE_CURRENCY, INVOICE_TODAY } from '../tinycld/books/lib/invoice-form-fixture'
import { invoiceTaxOf, shownInvoiceTotals } from '../tinycld/books/lib/invoice-tax'
import { type InvoiceFormValues, newInvoiceValues } from '../tinycld/books/lib/invoice-values'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

function row(id: string) {
    const found = TAX_RATE_ROWS.find(r => r.id === id)
    if (!found) throw new Error(`no tax rate ${id}`)
    return found
}

function ppmOf(id: string) {
    return row(id).rate_ppm
}

describe('invoiceTaxOf', () => {
    it('a rate is its own one component, labelled with its percent', () => {
        expect(invoiceTaxOf(TAX_RATE_ROWS, TAX_IDS.lodging)).toEqual({
            tax: { components: [{ id: TAX_IDS.lodging, ppm: 88_750 }] },
            label: 'Denver lodging (8.875%)',
        })
    })

    it("a group is its component rates, labelled with their sum: 'Denver combined (8.71%)'", () => {
        expect(invoiceTaxOf(TAX_RATE_ROWS, TAX_IDS.denverCombined)).toEqual({
            tax: {
                components: [
                    { id: TAX_IDS.state, ppm: ppmOf(TAX_IDS.state) },
                    { id: TAX_IDS.rtd, ppm: ppmOf(TAX_IDS.rtd) },
                    { id: TAX_IDS.denverCity, ppm: ppmOf(TAX_IDS.denverCity) },
                ],
            },
            label: 'Denver combined (8.71%)',
        })
    })

    it('a group leaves out a component whose row is not loaded', () => {
        const rows = TAX_RATE_ROWS.filter(r => r.id !== TAX_IDS.rtd)
        expect(invoiceTaxOf(rows, TAX_IDS.denverCombined)).toEqual({
            tax: {
                components: [
                    { id: TAX_IDS.state, ppm: ppmOf(TAX_IDS.state) },
                    { id: TAX_IDS.denverCity, ppm: ppmOf(TAX_IDS.denverCity) },
                ],
            },
            label: 'Denver combined (7.71%)',
        })
    })

    it('no choice, or a choice whose row is not loaded, is no tax', () => {
        expect(invoiceTaxOf(TAX_RATE_ROWS, '')).toEqual({ tax: null, label: null })
        const rows = TAX_RATE_ROWS.filter(r => r.id !== TAX_IDS.denverCombined)
        expect(invoiceTaxOf(rows, TAX_IDS.denverCombined)).toEqual({ tax: null, label: null })
    })
})

describe('shownInvoiceTotals', () => {
    function values(lines: TableRow[]): InvoiceFormValues {
        const base = newInvoiceValues({ today: INVOICE_TODAY, rates: [], defaultRateId: '' })
        return { ...base, lines }
    }

    function item(cells: Partial<TableRow>): TableRow {
        return {
            id: `row${Math.random().toString(36).slice(2, 14)}`,
            kind: 'item',
            product: 'prodbookkeep001',
            description: '',
            quantity: 2,
            rate: '100.00',
            amount: null,
            taxable: true,
            ...cells,
        }
    }

    const { tax } = invoiceTaxOf(TAX_RATE_ROWS, TAX_IDS.denverCombined)

    it('is the totals with the header tax when every cell parses', () => {
        const shown = shownInvoiceTotals(values([item({})]), tax, INVOICE_CURRENCY)
        const expected = documentTotals(
            [{ kind: 'item', quantity: 2, rate: 10_000, percentPpm: 0, taxable: true }],
            tax
        )
        expect(shown).toEqual(expected)
        expect(shown?.subtotal).toBe(20_000)
        expect(shown?.taxTotal).toBeGreaterThan(0)
    })

    it('is null while a rate does not parse', () => {
        expect(
            shownInvoiceTotals(values([item({ rate: 'abc' })]), tax, INVOICE_CURRENCY)
        ).toBeNull()
    })

    it('is null while a quantity is blank', () => {
        expect(
            shownInvoiceTotals(values([item({ quantity: null })]), tax, INVOICE_CURRENCY)
        ).toBeNull()
    })

    it('is null while a percent line has no line to apply to', () => {
        const percent: TableRow = {
            id: 'rowpercent0001',
            kind: 'percent',
            product: 'proddiscount001',
            description: '',
            percent: '-10',
            amount: null,
            taxable: false,
        }
        expect(shownInvoiceTotals(values([percent]), tax, INVOICE_CURRENCY)).toBeNull()
    })
})
