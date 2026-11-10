// What picking a customer or a product fills on an invoice form. Plain functions over
// rows, so the header fields' change handlers call them and the tests run them alone.

import type { TableRow } from '@tinycld/core/lib/forms/values'
import type { SearchPickerOption } from '../components/SearchPicker'
import type { BooksCustomers, BooksProducts, BooksTaxRates } from '../types'
import { dueDateFor } from './document-dates'
import { centsToText } from './money-text'

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
    terms: CustomerFill['terms']
    tax_rate: string
    // null leaves the due date as it is (a customer with no terms).
    due_date: string | null
    // The line taxable flags follow the customer only on the first pick and when the
    // exemption changes.
    resetTaxable: boolean
    isExempt: boolean
}

// The customer's own default rate unless it is exempt or the rate is inactive; else
// the book's default rate; else no tax.
function taxRateFor(customer: CustomerFill, rates: readonly TaxRateFill[]): string {
    const active = rates.filter(rate => !rate.inactive)
    const own = customer.tax_exempt
        ? undefined
        : active.find(rate => rate.id === customer.default_tax_rate)
    if (own) return own.id
    return active.find(rate => rate.is_default)?.id ?? ''
}

export function customerFills(
    customer: CustomerFill,
    rates: readonly TaxRateFill[],
    date: string,
    previousExempt: boolean | null
): CustomerFills {
    return {
        bill_to: customer.billing_address,
        email: customer.email,
        terms: customer.terms,
        tax_rate: taxRateFor(customer, rates),
        due_date: customer.terms === '' ? null : dueDateFor(date, customer.terms),
        resetTaxable: previousExempt === null || previousExempt !== customer.tax_exempt,
        isExempt: customer.tax_exempt,
    }
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
// currency sign), as the rate cell holds what is typed. Every Books amount has 2
// decimals, so the currency does not change the text.
export function lineFromProduct(
    product: Pick<BooksProducts, 'id' | 'sales_description' | 'price' | 'taxable'>,
    isExempt: boolean,
    _currency: string
): Record<string, unknown> {
    return {
        product: product.id,
        description: product.sales_description,
        rate: centsToText(product.price),
        quantity: 1,
        taxable: product.taxable && !isExempt,
    }
}

// The Customer picker's options in the order given: a sub-customer reads "Parent:
// Child", and the search runs on that label, so a parent's name finds its children.
export function invoiceCustomerOptions(input: {
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
