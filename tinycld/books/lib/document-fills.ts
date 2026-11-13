// What picking a customer or a product fills on a sales document form. Plain functions over
// rows, so the header fields' change handlers call them and the tests run them alone.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { SearchPickerOption } from '../components/SearchPicker'
import type { BooksCustomers, BooksProducts, BooksTaxRates } from '../types'
import { dueDateFor } from './document-dates'
import { centsToText } from './money-text'
import { INVOICE_KIND, type SalesDocumentKind } from './sales-document-kinds'

export type CustomerFill = Pick<
    BooksCustomers,
    | 'id'
    | 'display_name'
    | 'email'
    | 'billing_address'
    | 'terms'
    | 'tax_exempt'
    | 'default_tax_rate'
>

export type TaxRateFill = Pick<BooksTaxRates, 'id' | 'inactive' | 'is_default'>

export type CustomerFills = {
    bill_to: CustomerFill['billing_address']
    email: string
    // Absent for a kind with no Terms and no Due date (a sales receipt).
    terms?: CustomerFill['terms']
    tax_rate: string
    // null leaves the due date as it is (a customer with no terms).
    due_date?: string | null
    // The line taxable flags follow the customer only on the first pick and when the
    // exemption changes.
    resetTaxable: boolean
    isExempt: boolean
}

// The book's default rate while it is active, else '' (no tax): a new form's Tax, and
// Tax after "No customer" or for a customer with no rate of its own.
export function defaultTaxRateId(rates: readonly TaxRateFill[]): string {
    return rates.find(rate => rate.is_default && !rate.inactive)?.id ?? ''
}

// The customer's own default rate unless it is exempt or the rate is inactive; else
// the book's default rate; else no tax.
function taxRateFor(customer: CustomerFill, rates: readonly TaxRateFill[]): string {
    const own = customer.tax_exempt
        ? undefined
        : rates.find(rate => !rate.inactive && rate.id === customer.default_tax_rate)
    if (own) return own.id
    return defaultTaxRateId(rates)
}

// Only an invoice has Terms and a Due date, so only its fills carry them.
export function customerFills(
    customer: CustomerFill,
    rates: readonly TaxRateFill[],
    date: string,
    previousExempt: boolean | null,
    kind: Pick<SalesDocumentKind, 'key'> = INVOICE_KIND
): CustomerFills {
    const fills: CustomerFills = {
        bill_to: customer.billing_address,
        email: customer.email,
        tax_rate: taxRateFor(customer, rates),
        resetTaxable: previousExempt === null || previousExempt !== customer.tax_exempt,
        isExempt: customer.tax_exempt,
    }
    if (kind.key !== 'invoice') return fills
    return {
        ...fills,
        terms: customer.terms,
        due_date: customer.terms === '' ? null : dueDateFor(date, customer.terms),
    }
}

// Choosing "No customer" (a kind whose customer is optional): Bill to and Email clear and
// Tax goes to the book's default rate. The line taxable flags stay as they are.
export function clearedCustomerFills(defaultRateId: string): {
    bill_to: null
    email: string
    tax_rate: string
} {
    return { bill_to: null, email: '', tax_rate: defaultRateId }
}

function coveredBySubtotal(rowsAbove: readonly TableRow[]): TableRow[] {
    const covered: TableRow[] = []
    for (let index = rowsAbove.length - 2; index >= 0; index -= 1) {
        const row = rowsAbove[index]
        if (row.kind === 'subtotal') break
        if (row.kind === 'item' || row.kind === 'percent') covered.push(row)
    }
    return covered
}

// A Percent line's taxable default from the lines above it: the Item right above it
// decides; a Subtotal is taxable when every Item and Percent line it covers is (and
// none covered is off); anything else is off.
export function percentTaxableDefault(rowsAbove: readonly TableRow[]): boolean {
    const above = rowsAbove[rowsAbove.length - 1]
    if (above?.kind === 'item') return above.taxable === true
    if (above?.kind !== 'subtotal') return false
    const covered = coveredBySubtotal(rowsAbove)
    return covered.length > 0 && covered.every(row => row.taxable === true)
}

// Every line's taxable flag after a customer change that resets them: an exempt
// customer turns them all off; otherwise an Item takes its product's `taxable` and a
// Percent line follows the lines above it. Description and Subtotal rows stay.
export function lineTaxableDefaults(
    rows: readonly TableRow[],
    productTaxable: ReadonlyMap<string, boolean>,
    isExempt: boolean
): TableRow[] {
    const result: TableRow[] = []
    for (const row of rows) {
        if (row.kind === 'item') {
            const product = typeof row.product === 'string' ? row.product : ''
            const taxable = !isExempt && (productTaxable.get(product) ?? false)
            result.push({ ...row, taxable })
        } else if (row.kind === 'percent') {
            result.push({ ...row, taxable: !isExempt && percentTaxableDefault(result) })
        } else {
            result.push(row)
        }
    }
    return result
}

// The cells a product pick fills on a line. The rate is the price as plain text (no
// currency sign, no thousands separator: "1250.00"), as the rate cell holds what is
// typed; the cell groups it on blur. Every Books amount has 2 decimals, so the currency
// does not change the text.
export function lineFromProduct(
    product: Pick<BooksProducts, 'id' | 'sales_description' | 'price' | 'taxable'>,
    isExempt: boolean,
    _currency: string
): Record<string, unknown> {
    return {
        product: product.id,
        description: product.sales_description,
        rate: centsToText(product.price).replace(/,/g, ''),
        quantity: 1,
        taxable: product.taxable && !isExempt,
    }
}

export type BundleItemFill = {
    product: Pick<BooksProducts, 'id' | 'sales_description' | 'price' | 'taxable'>
    quantity: number
}

// Every cell of the `lines` table (lib/document-line-columns.ts) is present on a row, null when
// its kind does not draw it: react-hook-form fills an absent cell from the default at
// the same index.
const EMPTY_LINE_CELLS = {
    product: null,
    description: null,
    quantity: null,
    rate: null,
    percent: null,
    amount: null,
    taxable: null,
} as const

// A bundle item's quantity on the document: the item's quantity times the line's, to 2
// decimals. In hundredths, so no float product (0.1 × 3) rounds the wrong way.
function bundleQuantity(itemQuantity: number, lineQuantity: number): number {
    const hundredths = (Math.round(itemQuantity * 100) * Math.round(lineQuantity * 100)) / 100
    return Math.round(hundredths) / 100
}

// The rows a bundle picked on an Item line becomes: one Item row per bundle item (its
// product, sales description, price and taxable flag, qty = item qty × line qty), then a
// Subtotal row over them. A bundle with no items gives no rows.
export function bundleLines(input: {
    items: readonly BundleItemFill[]
    lineQuantity: number
    isExempt: boolean
    currency: string
    newId: () => string
}): TableRow[] {
    if (input.items.length === 0) return []
    const items: TableRow[] = input.items.map(item => ({
        id: input.newId(),
        ...EMPTY_LINE_CELLS,
        kind: 'item',
        ...lineFromProduct(item.product, input.isExempt, input.currency),
        quantity: bundleQuantity(item.quantity, input.lineQuantity),
    }))
    return [...items, { id: input.newId(), ...EMPTY_LINE_CELLS, kind: 'subtotal' }]
}

// The Customer picker's options in the order given: a sub-customer reads "Parent:
// Child", and the search runs on that label, so a parent's name finds its children.
export function documentCustomerOptions(input: {
    customers: readonly { id: string; display_name: string; parentName: string | undefined }[]
    term: string
}): SearchPickerOption[] {
    const term = input.term.trim().toLowerCase()
    const options = input.customers.map(customer => ({
        id: customer.id,
        label: customer.parentName
            ? `${customer.parentName}: ${customer.display_name}`
            : customer.display_name,
    }))
    if (term === '') return options
    return options.filter(option => option.label.toLowerCase().includes(term))
}
