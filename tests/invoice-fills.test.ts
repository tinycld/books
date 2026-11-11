import type { TableRow } from '@tinycld/core/lib/forms/values'
import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { dueDateFor } from '../tinycld/books/lib/document-dates'
import {
    bundleLines,
    type CustomerFill,
    customerFills,
    invoiceCustomerOptions,
    lineFromProduct,
    lineTaxableDefaults,
    percentTaxableDefault,
    type TaxRateFill,
} from '../tinycld/books/lib/invoice-fills'
import { PRODUCT_IDS, PRODUCTS } from '../tinycld/books/lib/products-services-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'

const DATE = '2026-11-04'

const RATES: TaxRateFill[] = TAX_RATE_ROWS.map(rate => ({
    id: rate.id,
    inactive: rate.inactive,
    is_default: rate.is_default,
}))

// The same rates with no `is_default` one.
const RATES_NO_DEFAULT: TaxRateFill[] = RATES.map(rate => ({ ...rate, is_default: false }))

function customer(id: string, overrides: Partial<CustomerFill> = {}): CustomerFill {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        billing_address: row.billing_address,
        terms: 'net_30',
        tax_exempt: false,
        default_tax_rate: '',
        ...overrides,
    }
}

describe('customerFills', () => {
    it('fills Bill to, Email and Terms from the customer and the due date from its terms', () => {
        const harborview = customer(CUSTOMER_IDS.harborview, {
            default_tax_rate: TAX_IDS.denverCombined,
        })
        const fills = customerFills(harborview, RATES, DATE, null)
        expect(fills.bill_to).toEqual(harborview.billing_address)
        expect(fills.email).toBe(harborview.email)
        expect(fills.terms).toBe('net_30')
        expect(fills.due_date).toBe(dueDateFor(DATE, 'net_30'))
        expect(fills.due_date).toBe('2026-12-04')
    })

    it("fills Tax with the customer's active default rate when it is not exempt", () => {
        const fills = customerFills(
            customer(CUSTOMER_IDS.harborview, { default_tax_rate: TAX_IDS.adamsCombined }),
            RATES,
            DATE,
            null
        )
        expect(fills.tax_rate).toBe(TAX_IDS.adamsCombined)
        expect(fills.isExempt).toBe(false)
    })

    // The fixture's exempt invoice 1003 carries Denver combined with $0.00 tax.
    it('skips an exempt customer’s default rate and fills the is_default rate', () => {
        const fills = customerFills(
            customer(CUSTOMER_IDS.northwind, {
                tax_exempt: true,
                default_tax_rate: TAX_IDS.adamsCombined,
            }),
            RATES,
            DATE,
            null
        )
        expect(fills.tax_rate).toBe(TAX_IDS.denverCombined)
        expect(fills.isExempt).toBe(true)
    })

    it('falls to the is_default rate when the customer’s default rate is inactive', () => {
        const fills = customerFills(
            customer(CUSTOMER_IDS.harborview, { default_tax_rate: TAX_IDS.oldCombined }),
            RATES,
            DATE,
            null
        )
        expect(fills.tax_rate).toBe(TAX_IDS.denverCombined)
    })

    it('fills no tax when there is no usable rate and no is_default rate', () => {
        const inactiveDefault = customerFills(
            customer(CUSTOMER_IDS.harborview, { default_tax_rate: TAX_IDS.retired }),
            RATES_NO_DEFAULT,
            DATE,
            null
        )
        expect(inactiveDefault.tax_rate).toBe('')
        const noDefault = customerFills(
            customer(CUSTOMER_IDS.harborview),
            RATES_NO_DEFAULT,
            DATE,
            null
        )
        expect(noDefault.tax_rate).toBe('')
    })

    it('resets the line taxable flags on the first pick and when the exemption changes', () => {
        const taxed = customer(CUSTOMER_IDS.harborview)
        const exempt = customer(CUSTOMER_IDS.northwind, { tax_exempt: true })
        expect(customerFills(taxed, RATES, DATE, null).resetTaxable).toBe(true)
        expect(customerFills(exempt, RATES, DATE, null).resetTaxable).toBe(true)
        expect(customerFills(taxed, RATES, DATE, true).resetTaxable).toBe(true)
        expect(customerFills(exempt, RATES, DATE, false).resetTaxable).toBe(true)
        expect(customerFills(taxed, RATES, DATE, false).resetTaxable).toBe(false)
        expect(customerFills(exempt, RATES, DATE, true).resetTaxable).toBe(false)
    })

    it('leaves the due date as it is (null) for a customer with no terms', () => {
        const fills = customerFills(
            customer(CUSTOMER_IDS.harborview, { terms: '' }),
            RATES,
            DATE,
            null
        )
        expect(fills.terms).toBe('')
        expect(fills.due_date).toBeNull()
    })

    it('fills a due date of the invoice date for Due on receipt', () => {
        const fills = customerFills(
            customer(CUSTOMER_IDS.alvarez, { terms: 'due_on_receipt' }),
            RATES,
            DATE,
            null
        )
        expect(fills.due_date).toBe(DATE)
    })
})

function product(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return {
        id: row.id,
        sales_description: row.sales_description,
        price: row.price,
        taxable: row.taxable,
    }
}

describe('lineFromProduct', () => {
    it('fills the description, the rate as plain text, qty 1 and the product’s taxable', () => {
        const accessPoint = product(PRODUCT_IDS.accessPoint)
        expect(accessPoint.taxable).toBe(true)
        expect(lineFromProduct(accessPoint, false, 'USD')).toMatchObject({
            product: PRODUCT_IDS.accessPoint,
            description: accessPoint.sales_description,
            rate: '189.00',
            quantity: 1,
            taxable: true,
        })
    })

    it('writes the price as plain text with no currency sign', () => {
        const line = lineFromProduct(
            { id: 'prodbookkeep001', sales_description: 'Monthly', price: 45_000, taxable: false },
            false,
            'USD'
        )
        expect(line.rate).toBe('450.00')
    })

    it('turns taxable off for an exempt customer and keeps a non-taxable product off', () => {
        expect(lineFromProduct(product(PRODUCT_IDS.accessPoint), true, 'USD').taxable).toBe(false)
        const service = { id: 'p', sales_description: '', price: 100, taxable: false }
        expect(lineFromProduct(service, false, 'USD').taxable).toBe(false)
    })
})

describe('bundleLines', () => {
    // A Service (not taxable) ×2 and a Non-inventory item (taxable) ×3.
    const service = product(PRODUCT_IDS.taxPrep)
    const nonInventory = product(PRODUCT_IDS.accessPoint)
    const items = [
        { product: service, quantity: 2 },
        { product: nonInventory, quantity: 3 },
    ]

    function ids() {
        let n = 0
        return () => {
            n += 1
            return `newrow${n}`
        }
    }

    it('makes one Item row per item with qty = item qty × line qty, then a Subtotal row', () => {
        expect(service.taxable).toBe(false)
        expect(nonInventory.taxable).toBe(true)
        const rows = bundleLines({
            items,
            lineQuantity: 1.5,
            isExempt: false,
            currency: 'USD',
            newId: ids(),
        })
        expect(rows.map(r => r.kind)).toEqual(['item', 'item', 'subtotal'])
        expect(rows[0]).toMatchObject({
            kind: 'item',
            product: PRODUCT_IDS.taxPrep,
            description: service.sales_description,
            quantity: 3,
            rate: '1250.00',
            taxable: false,
        })
        expect(rows[1]).toMatchObject({
            kind: 'item',
            product: PRODUCT_IDS.accessPoint,
            description: nonInventory.sales_description,
            quantity: 4.5,
            rate: '189.00',
            taxable: true,
        })
    })

    it('turns every row’s taxable off for an exempt customer', () => {
        const rows = bundleLines({
            items,
            lineQuantity: 1.5,
            isExempt: true,
            currency: 'USD',
            newId: ids(),
        })
        const itemRows = rows.filter(r => r.kind === 'item')
        expect(itemRows).toHaveLength(2)
        expect(itemRows.map(r => r.taxable)).toEqual([false, false])
        expect(rows.some(r => r.taxable === true)).toBe(false)
    })

    it('takes the row ids from newId in order', () => {
        const rows = bundleLines({
            items,
            lineQuantity: 1.5,
            isExempt: false,
            currency: 'USD',
            newId: ids(),
        })
        expect(rows.map(r => r.id)).toEqual(['newrow1', 'newrow2', 'newrow3'])
    })

    it('gives no rows for a bundle with no items', () => {
        expect(
            bundleLines({
                items: [],
                lineQuantity: 1,
                isExempt: false,
                currency: 'USD',
                newId: ids(),
            })
        ).toEqual([])
    })
})

describe('invoiceCustomerOptions', () => {
    const customers = [
        {
            id: 'c2',
            display_name: 'Harborview Kitchen',
            parentName: 'Harborview Hospitality Group',
        },
        { id: 'c1', display_name: 'Harborview Hospitality Group', parentName: undefined },
        { id: 'c3', display_name: 'Marisol Alvarez', parentName: undefined },
    ]

    it('labels a sub-customer "Parent: Child" and a top-level customer by its name, in input order', () => {
        const options = invoiceCustomerOptions({ customers, term: '' })
        expect(options.map(o => [o.id, o.label])).toEqual([
            ['c2', 'Harborview Hospitality Group: Harborview Kitchen'],
            ['c1', 'Harborview Hospitality Group'],
            ['c3', 'Marisol Alvarez'],
        ])
    })

    it('searches the label, so a parent’s name finds its sub-customers', () => {
        const byParent = invoiceCustomerOptions({ customers, term: 'hospitality' })
        expect(byParent.map(o => o.id)).toEqual(['c2', 'c1'])
        const byLabel = invoiceCustomerOptions({ customers, term: 'group: harbor' })
        expect(byLabel.map(o => o.id)).toEqual(['c2'])
        const byChild = invoiceCustomerOptions({ customers, term: 'kitchen' })
        expect(byChild.map(o => o.label)).toEqual([
            'Harborview Hospitality Group: Harborview Kitchen',
        ])
    })
})

function row(cells: Record<string, unknown>): TableRow {
    return { id: `row${Math.random().toString(36).slice(2, 14)}`, ...cells }
}

const itemRow = (product: string, taxable: boolean) =>
    row({ kind: 'item', product, description: '', quantity: 1, rate: '10.00', taxable })
const percentRow = (taxable: boolean) =>
    row({ kind: 'percent', product: 'proddiscount001', percent: '-10', taxable })
const subtotalRow = () => row({ kind: 'subtotal', amount: null })
const descriptionRow = () => row({ kind: 'description', description: 'Notes' })

describe('lineTaxableDefaults', () => {
    const productTaxable = new Map([
        ['prodtaxable001', true],
        ['prodnotaxable1', false],
    ])

    it('turns every Item and Percent row off for an exempt customer and leaves the others', () => {
        const rows = [
            itemRow('prodtaxable001', true),
            percentRow(true),
            itemRow('prodnotaxable1', false),
            subtotalRow(),
            percentRow(true),
            descriptionRow(),
        ]
        const result = lineTaxableDefaults(rows, productTaxable, true)
        expect(result.map(r => r.taxable)).toEqual([
            false,
            false,
            false,
            undefined,
            false,
            undefined,
        ])
        expect(result[3]).toEqual(rows[3])
        expect(result[5]).toEqual(rows[5])
        expect(result.map(r => r.id)).toEqual(rows.map(r => r.id))
    })

    it('back from exempt sets each Item to its product’s taxable and each Percent from the rows above', () => {
        const rows = [
            itemRow('prodtaxable001', false),
            percentRow(false),
            itemRow('prodnotaxable1', false),
            subtotalRow(),
            percentRow(false),
            descriptionRow(),
        ]
        const result = lineTaxableDefaults(rows, productTaxable, false)
        // Item 1 taxable; the percent under it follows it; item 2's product is not taxable;
        // the subtotal covers a non-taxable line, so the percent under it is off.
        expect(result.map(r => r.taxable)).toEqual([true, true, false, undefined, false, undefined])
        expect(result[1].taxable).toBe(percentTaxableDefault(result.slice(0, 1)))
        expect(result[4].taxable).toBe(percentTaxableDefault(result.slice(0, 4)))
        expect(result[3]).toEqual(rows[3])
        expect(result[5]).toEqual(rows[5])
    })
})

describe('percentTaxableDefault', () => {
    it('follows the Item right above', () => {
        expect(percentTaxableDefault([itemRow('p', true)])).toBe(true)
        expect(percentTaxableDefault([itemRow('p', false)])).toBe(false)
    })

    it('under a Subtotal is on only when every line it covers is taxable', () => {
        expect(
            percentTaxableDefault([itemRow('p', true), itemRow('q', false), subtotalRow()])
        ).toBe(false)
        expect(percentTaxableDefault([itemRow('p', true), percentRow(true), subtotalRow()])).toBe(
            true
        )
    })

    it('under a Subtotal reads only the lines since the previous Subtotal', () => {
        expect(
            percentTaxableDefault([
                itemRow('p', false),
                subtotalRow(),
                itemRow('q', true),
                subtotalRow(),
            ])
        ).toBe(true)
    })

    it('under a Subtotal that covers no line is off', () => {
        expect(percentTaxableDefault([subtotalRow()])).toBe(false)
    })

    it('under a Description line or as the first line is off', () => {
        expect(percentTaxableDefault([itemRow('p', true), descriptionRow()])).toBe(false)
        expect(percentTaxableDefault([])).toBe(false)
    })
})
