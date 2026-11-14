import type { DocumentTotals } from './document-lines'
import {
    BILL_MESSAGES,
    ESTIMATE_MESSAGES,
    INVOICE_MESSAGES,
    SALES_RECEIPT_MESSAGES,
} from './document-texts'
import { TOO_LARGE_TEXT } from './entry-lines'
import { formatMoney } from './money'
import { maxStoredAmount } from './money-text'
import type { DocumentLineTable, SalesDocumentKind } from './sales-document-kinds'

// The texts themselves live in lib/document-texts.ts, a module with no imports, so the
// kinds' data module (lib/sales-document-kinds.ts) loads without the money code below.
// This module exports them too, beside the helpers that read them.
export {
    type DocumentMessages,
    ESTIMATE_MESSAGES,
    INVOICE_MESSAGES,
    SALES_RECEIPT_MESSAGES,
} from './document-texts'

// Every kind refuses an inactive customer with the same words.
export function customerInactiveText(name: string): string {
    // A replacer function, so a `$&` in a typed name stays as typed.
    return INVOICE_MESSAGES.customerInactive.replace('%s', () => name)
}

// Where a server refusal of a sales document save shows: under the field it names, under
// the line it numbers (zero-based), else in the form's error summary. A PocketBase field
// error (`reference_no`, `payment_method`) is keyed by its field and never comes here.
export type DocumentRefusalTarget =
    | 'customer'
    | 'vendor'
    | 'ref_no'
    | 'date'
    | 'due_date'
    | 'tax_rate'
    | 'deposit_to'
    | 'expiration_date'
    | 'accepted_date'
    | { line: number }
    | 'root'

const LINE_REFUSAL = /^Line (\d+):/
const CUSTOMER_REFUSAL = /^Customer\b|is inactive\. Choose an active customer\.?$/
// server/sales_documents.go msgDocumentDay and msgDocumentDayTooEarly. An invoice's
// server sends them for its due date too, so the text names the date field only for a
// kind with no due date.
const DATE_REFUSAL = /^Enter a date (that exists|in 1900 or later)\b/
const DUE_DATE_REFUSAL = /^(The due date|Due date)\b/
// The server's own "The tax rate is inactive. Choose an active rate." included.
const TAX_REFUSAL = /^(The tax|Tax)\b/
// server/sales_receipts.go msgReceiptDepositInvalid and msgReceiptDepositNone.
const DEPOSIT_REFUSAL =
    /^(Choose an active bank or Undeposited funds account|Add a bank account or an Undeposited funds account)\b/
// server/estimates.go msgExpirationBeforeDate and msgAcceptedDateRequired.
const EXPIRATION_REFUSAL = /^Expiration date\b/
const ACCEPTED_DATE_REFUSAL = /^Enter the accepted date\b/
// server/bills.go: the inactive vendor ("%s is inactive. Choose an active vendor.") and
// the duplicate vendor's bill no. ("%s already has bill no. %s (%s).").
const VENDOR_REFUSAL = /is inactive\. Choose an active vendor\.?$/
const DUPLICATE_REF_REFUSAL = / already has bill no\. .+ \(.+\)\.?$/

// A bill's own fields: Vendor, Due date and Vendor's bill no.; null for another text.
function billRefusalTarget(message: string): DocumentRefusalTarget | null {
    if (VENDOR_REFUSAL.test(message)) return 'vendor'
    if (DUPLICATE_REF_REFUSAL.test(message)) return 'ref_no'
    if (DUE_DATE_REFUSAL.test(message)) return 'due_date'
    return null
}

// The kind decides which fields it has (its `key`): only an invoice and a bill have a due
// date, only a sales receipt has Deposit to, only an estimate has Expiration date and
// Accepted date, only a bill has Vendor and Vendor's bill no. (and no customer or tax).
export function documentRefusalTarget(
    message: string,
    kind: Pick<SalesDocumentKind, 'key'>
): DocumentRefusalTarget {
    const line = LINE_REFUSAL.exec(message)
    if (line) return { line: Number(line[1]) - 1 }
    if (kind.key === 'bill') return billRefusalTarget(message) ?? 'root'
    if (CUSTOMER_REFUSAL.test(message)) return 'customer'
    if (kind.key === 'sales_receipt' && DATE_REFUSAL.test(message)) return 'date'
    if (kind.key === 'invoice' && DUE_DATE_REFUSAL.test(message)) return 'due_date'
    if (TAX_REFUSAL.test(message)) return 'tax_rate'
    if (kind.key === 'sales_receipt' && DEPOSIT_REFUSAL.test(message)) return 'deposit_to'
    if (kind.key === 'estimate' && EXPIRATION_REFUSAL.test(message)) return 'expiration_date'
    if (kind.key === 'estimate' && ACCEPTED_DATE_REFUSAL.test(message)) return 'accepted_date'
    return 'root'
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "<row label> <n>:" at the start of a refusal ("Line 3:", "Account line 2:").
function rowLabelPattern(rowLabel: string): RegExp {
    return new RegExp(`^${escapeRegExp(rowLabel)} (\\d+):`)
}

// The line table and the zero-based line a refusal text numbers, by the row labels of
// the kind's line tables ("Line 3: …" on a sales kind, "Account line 2: …" on a bill);
// null for a text that numbers none of them.
export function tableLineRefusal(
    message: string,
    tables: readonly Pick<DocumentLineTable, 'key' | 'rowLabel'>[]
): { table: string; line: number } | null {
    for (const table of tables) {
        const match = rowLabelPattern(table.rowLabel).exec(message)
        if (match) return { table: table.key, line: Number(match[1]) - 1 }
    }
    return null
}

// The refusal text of a line write, with the write's "<row label> <n>" label in front.
// The server's line checks already start their text with the stored line's number under
// the same row label, which is the one the user sees, so such a text keeps its own label
// and gets no second one. A totals text gets none either: the server checks the totals
// of a batch one time and refuses on the batch's first line write, which is not the line
// that made the total (server/sales_document_deferral.go).
export function labelledLineRefusal(rowLabel: string | null, message: string): string {
    if (rowLabel === null || LINE_REFUSAL.test(message) || TOTALS_REFUSALS.has(message)) {
        return message
    }
    const labelWord = rowLabel.replace(/ \d+$/, '')
    if (rowLabelPattern(labelWord).test(message)) return message
    return `${rowLabel}: ${message}`
}

const TOTALS_REFUSALS = new Set<string>(
    [INVOICE_MESSAGES, SALES_RECEIPT_MESSAGES, ESTIMATE_MESSAGES, BILL_MESSAGES].flatMap(
        messages => [messages.totalNegative, messages.totalTooLarge]
    )
)

const NO_TOTAL = '—'

// The header's big figure (an invoice's Balance due): a dash while the lines do not add
// up, "Too large" past the limit (a line past it, or a total past what Books can store),
// else the total as money.
export function bigFigureText(
    totals: Pick<DocumentTotals, 'isTooLarge' | 'total'> | null,
    currency: string
): string {
    if (totals === null) return NO_TOTAL
    if (totals.isTooLarge || Math.abs(totals.total) > maxStoredAmount) return TOO_LARGE_TEXT
    return formatMoney(totals.total, currency)
}
