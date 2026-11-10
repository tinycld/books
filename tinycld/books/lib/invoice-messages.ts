import type { DocumentTotals } from './document-lines'
import { TOO_LARGE_TEXT } from './entry-lines'
import { formatMoney } from './money'
import { maxStoredAmount } from './money-text'

// The invoice's texts. The first group is shown by the client and refused by the
// server with the same words (server/invoices.go); tests/invoice-messages.test.ts
// fails when they drift. PocketBase adds a final period to a server text that has
// none. `%s` is the customer's name: the client fills it with customerInactiveText,
// the server with refuseNamed.
export const INVOICE_MESSAGES = {
    dueBeforeDate: 'The due date cannot be before the invoice date',
    percentTarget: 'A percent line applies to the item or subtotal right above it',
    totalNegative: 'An invoice total cannot be below zero. Use a credit memo.',
    totalTooLarge: 'The invoice total is more than Books can store.',
    tooManyLines: 'An invoice can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on invoices. Make it inactive instead.',

    // Client only.
    needItemLine: 'Add at least one product or service line',
    quantityNotPositive: 'Enter a quantity more than 0',
    quantityDecimals: 'A quantity can have at most 2 decimals',
    quantityTooLarge: 'A quantity can be at most 1,000,000',
    rateMalformed: 'Enter a rate like 1,234.50',
    rateTooLarge: 'The rate is too large',
    percentRange: 'Enter a percent from -100 to 1000',
    percentDecimals: 'A percent can have at most 4 decimals',
    noAccess: 'You need bookkeeper access to create invoices',
    notFound: 'This invoice does not exist',
    cannotEdit: 'This invoice cannot be edited',
    loadFailed: 'Books could not load this invoice.',
    customerLoadFailed: 'Books could not load this customer.',
    pdfUnsaved: 'Save a draft to see the PDF',
    pdfStale: 'Shows the last saved version',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

export function customerInactiveText(name: string): string {
    // A replacer function, so a `$&` in a typed name stays as typed.
    return INVOICE_MESSAGES.customerInactive.replace('%s', () => name)
}

// Where a server refusal of an invoice save shows: under the field it names, under the
// line it numbers (zero-based), else in the form's error summary.
export type InvoiceRefusalTarget = 'customer' | 'due_date' | 'tax_rate' | { line: number } | 'root'

const LINE_REFUSAL = /^Line (\d+):/
const CUSTOMER_REFUSAL = /^Customer\b|is inactive\. Choose an active customer\.?$/
const DUE_DATE_REFUSAL = /^(The due date|Due date)\b/
// The server's own "The tax rate is inactive. Choose an active rate." included.
const TAX_REFUSAL = /^(The tax|Tax)\b/

export function invoiceRefusalTarget(message: string): InvoiceRefusalTarget {
    const line = LINE_REFUSAL.exec(message)
    if (line) return { line: Number(line[1]) - 1 }
    if (CUSTOMER_REFUSAL.test(message)) return 'customer'
    if (DUE_DATE_REFUSAL.test(message)) return 'due_date'
    if (TAX_REFUSAL.test(message)) return 'tax_rate'
    return 'root'
}

const NO_TOTAL = '—'

// The header's Balance due: a dash while the lines do not add up, "Too large" past the
// limit (a line past it, or a total past what Books can store), else the total as money.
export function balanceDueText(totals: DocumentTotals | null, currency: string): string {
    if (totals === null) return NO_TOTAL
    if (totals.isTooLarge || Math.abs(totals.total) > maxStoredAmount) return TOO_LARGE_TEXT
    return formatMoney(totals.total, currency)
}
