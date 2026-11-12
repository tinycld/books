import type { DocumentTotals } from './document-lines'
import { INVOICE_MESSAGES } from './document-texts'
import { TOO_LARGE_TEXT } from './entry-lines'
import { formatMoney } from './money'
import { maxStoredAmount } from './money-text'
import type { SalesDocumentKind } from './sales-document-kinds'

// The texts themselves live in lib/document-texts.ts, a module with no imports, so the
// kinds' data module (lib/sales-document-kinds.ts) loads without the money code below.
// This module exports them too, beside the helpers that read them.
export { type DocumentMessages, INVOICE_MESSAGES } from './document-texts'

// Every kind refuses an inactive customer with the same words.
export function customerInactiveText(name: string): string {
    // A replacer function, so a `$&` in a typed name stays as typed.
    return INVOICE_MESSAGES.customerInactive.replace('%s', () => name)
}

// Where a server refusal of a sales document save shows: under the field it names, under
// the line it numbers (zero-based), else in the form's error summary.
export type DocumentRefusalTarget = 'customer' | 'due_date' | 'tax_rate' | { line: number } | 'root'

const LINE_REFUSAL = /^Line (\d+):/
const CUSTOMER_REFUSAL = /^Customer\b|is inactive\. Choose an active customer\.?$/
const DUE_DATE_REFUSAL = /^(The due date|Due date)\b/
// The server's own "The tax rate is inactive. Choose an active rate." included.
const TAX_REFUSAL = /^(The tax|Tax)\b/

// The kind decides which fields it has: only an invoice has a due date (its `key`).
export function documentRefusalTarget(
    message: string,
    kind: SalesDocumentKind
): DocumentRefusalTarget {
    const line = LINE_REFUSAL.exec(message)
    if (line) return { line: Number(line[1]) - 1 }
    if (CUSTOMER_REFUSAL.test(message)) return 'customer'
    if (kind.key === 'invoice' && DUE_DATE_REFUSAL.test(message)) return 'due_date'
    if (TAX_REFUSAL.test(message)) return 'tax_rate'
    return 'root'
}

// The refusal text of a line write, with the write's "Line n" label in front. The
// server's line checks already start their text with the stored line's number, which
// is the one the user sees, so such a text keeps its own label and gets no second one.
export function labelledLineRefusal(rowLabel: string | null, message: string): string {
    if (rowLabel === null || LINE_REFUSAL.test(message)) return message
    return `${rowLabel}: ${message}`
}

const NO_TOTAL = '—'

// The header's big figure (an invoice's Balance due): a dash while the lines do not add
// up, "Too large" past the limit (a line past it, or a total past what Books can store),
// else the total as money.
export function bigFigureText(totals: DocumentTotals | null, currency: string): string {
    if (totals === null) return NO_TOTAL
    if (totals.isTooLarge || Math.abs(totals.total) > maxStoredAmount) return TOO_LARGE_TEXT
    return formatMoney(totals.total, currency)
}
