// The screen that shows an audited record, for its history's Open button (spec §5
// Client). Paths are without the org prefix; callers pass them through `useOrgHref`. A
// line, bundle item, estimate response, payment application or bill payment line never
// reaches here: its history is its parent's.
import { recordTypeLabel } from './audit-log'
import { customerPath } from './customer-route'
import { documentHref } from './document-routes'
import { entryHref } from './entry-route'
import { DOCUMENT_COLLECTIONS } from './history-route'
import { productPath } from './product-route'
import type { RecordRoute } from './record-route'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    EXPENSE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from './sales-document-kinds'
import { vendorPath } from './vendor-route'

type LiveRecord = Record<string, unknown>

// Each document kind by the collection it is stored in; DOCUMENT_COLLECTIONS is the one
// map of kind to collection.
const DOCUMENT_KINDS = new Map<string, SalesDocumentKind>(
    [
        INVOICE_KIND,
        SALES_RECEIPT_KIND,
        CREDIT_MEMO_KIND,
        ESTIMATE_KIND,
        BILL_KIND,
        EXPENSE_KIND,
    ].map(kind => [DOCUMENT_COLLECTIONS[kind.key], kind])
)

// A record route's filled path: the route pattern `…/[id]` with its id.
function filledPath(route: RecordRoute): string {
    const id = route.params?.id ?? ''
    return route.path.replace('[id]', id)
}

const RECORD_PATHS: Record<string, (id: string) => string> = {
    books_customers: id => filledPath(customerPath(id)),
    books_vendors: id => filledPath(vendorPath(id)),
    books_products: id => filledPath(productPath(id)),
    books_accounts: id => `books/accounts/${id}`,
    books_payments: id => `books/payments/${id}`,
    books_bill_payments: id => `books/bill-payments/${id}`,
}

// Records shown on a screen that holds a group of them, and that screen's Open label.
const GROUP_SCREENS: Record<string, { path: string; label: string }> = {
    books_tax_agencies: { path: 'books/taxes', label: 'Open taxes' },
    books_tax_rates: { path: 'books/taxes', label: 'Open taxes' },
    books_settings: { path: 'books/settings', label: 'Open settings' },
    books_doc_sequences: { path: 'books/settings', label: 'Open settings' },
    books_close_overrides: { path: 'books/settings', label: 'Open settings' },
    books_admins: { path: 'books/settings', label: 'Open settings' },
    books_bank_connections: { path: 'books/banking', label: 'Open banking' },
    books_bank_files: { path: 'books/banking', label: 'Open banking' },
    books_bank_imports: { path: 'books/banking', label: 'Open banking' },
    books_bank_transactions: { path: 'books/banking', label: 'Open banking' },
}

function textOf(live: LiveRecord, key: string): string {
    const value = live[key]
    return typeof value === 'string' ? value : ''
}

type RoutedEntry = Parameters<typeof entryHref>[0]

// An entry's doc types and origins (migration 2100000002). A value not listed (a newer
// schema's) reads as a journal entry's reversal, which entryHref opens as a plain entry.
export const ROUTED_DOC_TYPES: readonly string[] = [
    'journal',
    'transfer',
    'invoice',
    'sales_receipt',
    'credit_memo',
    'bill',
    'expense',
    'payment',
    'bill_payment',
] satisfies readonly RoutedEntry['doc_type'][]
const ROUTED_ORIGINS: readonly string[] = [
    'manual',
    'reversal',
    'auto_reversal',
    'void_reversal',
    'opening_balance',
    'document',
] satisfies readonly RoutedEntry['origin'][]

function isDocType(value: string): value is RoutedEntry['doc_type'] {
    return ROUTED_DOC_TYPES.includes(value)
}

function isOrigin(value: string): value is RoutedEntry['origin'] {
    return ROUTED_ORIGINS.includes(value)
}

// An entry opens where entryHref says.
function entryPath(id: string, live: LiveRecord): string {
    const docType = textOf(live, 'doc_type')
    const origin = textOf(live, 'origin')
    return entryHref({
        id,
        doc_type: isDocType(docType) ? docType : 'journal',
        origin: isOrigin(origin) ? origin : 'reversal',
        document: textOf(live, 'document'),
    })
}

// A party contact opens its customer or vendor.
function contactPath(live: LiveRecord): string | null {
    const customer = textOf(live, 'customer')
    if (customer) return filledPath(customerPath(customer))
    const vendor = textOf(live, 'vendor')
    return vendor ? filledPath(vendorPath(vendor)) : null
}

// The document an attachment belongs to (a bill or an expense), from its live row.
function attachmentParent(live: LiveRecord): { collection: string; id: string } | null {
    const bill = textOf(live, 'bill')
    if (bill) return { collection: 'books_bills', id: bill }
    const expense = textOf(live, 'expense')
    return expense ? { collection: 'books_expenses', id: expense } : null
}

// An attachment opens its bill or expense.
function attachmentPath(live: LiveRecord): string | null {
    const parent = attachmentParent(live)
    const kind = parent ? DOCUMENT_KINDS.get(parent.collection) : undefined
    return parent && kind ? documentHref(kind, parent.id) : null
}

/**
 * The screen of a record, from its live row; null when the record is gone or the reader
 * cannot read it (`live` undefined), or when no screen shows it.
 */
export function auditRecordHref(
    collection: string,
    id: string,
    live: LiveRecord | undefined
): string | null {
    if (!live) return null
    const kind = DOCUMENT_KINDS.get(collection)
    if (kind) return documentHref(kind, id)
    if (collection === 'books_journal_entries') return entryPath(id, live)
    if (collection === 'books_party_contacts') return contactPath(live)
    if (collection === 'books_attachments') return attachmentPath(live)
    const recordPath = RECORD_PATHS[collection]
    if (recordPath) return recordPath(id)
    return GROUP_SCREENS[collection]?.path ?? null
}

/** The Open button's label: "Open invoice", or the screen of a group ("Open settings"). */
export function auditOpenLabel(collection: string): string {
    const group = GROUP_SCREENS[collection]
    if (group) return group.label
    return `Open ${recordTypeLabel(collection).toLowerCase()}`
}

/**
 * The Open button's label for a record's live row: it names the screen the button opens,
 * so a party contact reads "Open customer" or "Open vendor" (contactPath), and an
 * attachment "Open bill" or "Open expense" (attachmentPath).
 */
export function auditRecordOpenLabel(collection: string, live: LiveRecord | undefined): string {
    if (!live) return auditOpenLabel(collection)
    if (collection === 'books_attachments') {
        const parent = attachmentParent(live)
        return auditOpenLabel(parent ? parent.collection : collection)
    }
    if (collection !== 'books_party_contacts') return auditOpenLabel(collection)
    if (textOf(live, 'customer')) return auditOpenLabel('books_customers')
    if (textOf(live, 'vendor')) return auditOpenLabel('books_vendors')
    return auditOpenLabel(collection)
}
