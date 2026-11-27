// The screen that shows an audited record, for its history's Open button (spec §5
// Client). Paths are without the org prefix; callers pass them through `useOrgHref`. A
// line, bundle item, estimate response, payment application or bill payment line never
// reaches here: its history is its parent's.
import { recordTypeLabel } from './audit-log'
import { customerPath } from './customer-route'
import { documentPath } from './document-routes'
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
    PURCHASE_ORDER_KIND,
    REFUND_RECEIPT_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
    VENDOR_CREDIT_KIND,
} from './sales-document-kinds'
import { isSendDocType } from './send-doc-types'
import { vendorPath } from './vendor-route'

type LiveRecord = Record<string, unknown>

// Each document kind by the collection it is stored in; DOCUMENT_COLLECTIONS is the one
// map of kind to collection.
const DOCUMENT_KINDS = new Map<string, SalesDocumentKind>(
    [
        INVOICE_KIND,
        SALES_RECEIPT_KIND,
        CREDIT_MEMO_KIND,
        REFUND_RECEIPT_KIND,
        ESTIMATE_KIND,
        BILL_KIND,
        EXPENSE_KIND,
        VENDOR_CREDIT_KIND,
        PURCHASE_ORDER_KIND,
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
    books_vendor_refunds: id => `books/vendor-refunds/${id}`,
    books_write_offs: id => `books/write-offs/${id}`,
    books_statements: id => `books/statements/${id}`,
    books_deposits: id => `books/deposits/${id}`,
    books_reconciliations: id => `books/reconcile/${id}`,
}

// A record whose Open label names its screen in fewer words than its record type
// ("Customer statement").
const OPEN_LABELS: Record<string, string> = {
    books_statements: 'Open statement',
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
    books_bank_matches: { path: 'books/banking', label: 'Open banking' },
    books_bank_categorizations: { path: 'books/banking', label: 'Open banking' },
}

function textOf(live: LiveRecord, key: string): string {
    const value = live[key]
    return typeof value === 'string' ? value : ''
}

type RoutedEntry = Parameters<typeof entryHref>[0]

// An entry's doc types and origins (migration 2100000002). A value not listed (a newer
// schema's) reads as a journal entry's reversal, which entryHref opens as a plain entry.
// tests/migration-doc-types.test.ts fails when the migration gains a doc type this list
// lacks.
export const ROUTED_DOC_TYPES: readonly string[] = [
    'journal',
    'transfer',
    'invoice',
    'sales_receipt',
    'credit_memo',
    'refund_receipt',
    'bill',
    'expense',
    'vendor_credit',
    'payment',
    'bill_payment',
    'vendor_refund',
    'write_off',
    'deposit',
    'inventory_adjustment',
] satisfies readonly RoutedEntry['doc_type'][]
const ROUTED_ORIGINS: readonly string[] = [
    'manual',
    'reversal',
    'auto_reversal',
    'void_reversal',
    'opening_balance',
    'document',
] satisfies readonly RoutedEntry['origin'][]

export function isDocType(value: string): value is RoutedEntry['doc_type'] {
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
        // No number here: the link opens by id, and the route puts the number in the URL.
        sequence: 0,
        status: 'posted',
    })
}

// A party contact opens its customer or vendor.
function contactPath(live: LiveRecord): string | null {
    const customer = textOf(live, 'customer')
    if (customer) return filledPath(customerPath(customer))
    const vendor = textOf(live, 'vendor')
    return vendor ? filledPath(vendorPath(vendor)) : null
}

// The document an attachment belongs to (a bill, an expense or a vendor credit), from its
// live row.
function attachmentParent(live: LiveRecord): { collection: string; id: string } | null {
    const bill = textOf(live, 'bill')
    if (bill) return { collection: 'books_bills', id: bill }
    const expense = textOf(live, 'expense')
    if (expense) return { collection: 'books_expenses', id: expense }
    const credit = textOf(live, 'vendor_credit')
    return credit ? { collection: 'books_vendor_credits', id: credit } : null
}

// The credit memo a credit memo application belongs to (apply credit spec §3.8: its
// history opens the credit memo, never the invoice).
function memoApplicationParent(live: LiveRecord): { collection: string; id: string } | null {
    const memo = textOf(live, 'credit_memo')
    return memo ? { collection: 'books_credit_memos', id: memo } : null
}

// The deposit a deposit item or an other funds line belongs to (bank deposit spec §3.10:
// its history is filed under the deposit, and opens the deposit).
function depositParent(live: LiveRecord): { collection: string; id: string } | null {
    const deposit = textOf(live, 'deposit')
    return deposit ? { collection: 'books_deposits', id: deposit } : null
}

// The sales document a sent email belongs to: its doc_type names the kind and `document`
// the id (email-share plan decision 2: its history is filed under that document).
function sendParent(live: LiveRecord): { collection: string; id: string } | null {
    const docType = textOf(live, 'doc_type')
    const document = textOf(live, 'document')
    const collection = isSendDocType(docType) ? DOCUMENT_COLLECTIONS[docType] : undefined
    return collection && document ? { collection, id: document } : null
}

// Records that open the document they belong to, by their collection.
const PARENT_DOCUMENTS: Record<
    string,
    (live: LiveRecord) => { collection: string; id: string } | null
> = {
    books_attachments: attachmentParent,
    books_credit_memo_applications: memoApplicationParent,
    books_deposit_items: depositParent,
    books_deposit_lines: depositParent,
    books_document_sends: sendParent,
}

// An attachment opens its bill, expense or vendor credit; an application its credit memo;
// a deposit item or line its deposit (a record path, as the deposit is no sales document);
// a sent email its sales document.
function parentDocumentPath(
    parentOf: (live: LiveRecord) => { collection: string; id: string } | null,
    live: LiveRecord
): string | null {
    const parent = parentOf(live)
    if (!parent) return null
    const kind = DOCUMENT_KINDS.get(parent.collection)
    if (kind) return documentPath(kind, parent.id)
    return RECORD_PATHS[parent.collection]?.(parent.id) ?? null
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
    if (kind) return documentPath(kind, id)
    if (collection === 'books_journal_entries') return entryPath(id, live)
    if (collection === 'books_party_contacts') return contactPath(live)
    const parentOf = PARENT_DOCUMENTS[collection]
    if (parentOf) return parentDocumentPath(parentOf, live)
    const recordPath = RECORD_PATHS[collection]
    if (recordPath) return recordPath(id)
    return GROUP_SCREENS[collection]?.path ?? null
}

/** The Open button's label: "Open invoice", or the screen of a group ("Open settings"). */
export function auditOpenLabel(collection: string): string {
    const group = GROUP_SCREENS[collection]
    if (group) return group.label
    const own = OPEN_LABELS[collection]
    if (own) return own
    return `Open ${recordTypeLabel(collection).toLowerCase()}`
}

/**
 * The Open button's label for a record's live row: it names the screen the button opens,
 * so a party contact reads "Open customer" or "Open vendor" (contactPath), an attachment
 * "Open bill", "Open expense" or "Open vendor credit", a credit memo application
 * "Open credit memo", a deposit item or line "Open deposit", and a sent email the kind of
 * its document, "Open invoice" (PARENT_DOCUMENTS).
 */
export function auditRecordOpenLabel(collection: string, live: LiveRecord | undefined): string {
    if (!live) return auditOpenLabel(collection)
    const parentOf = PARENT_DOCUMENTS[collection]
    if (parentOf) {
        const parent = parentOf(live)
        return auditOpenLabel(parent ? parent.collection : collection)
    }
    if (collection !== 'books_party_contacts') return auditOpenLabel(collection)
    if (textOf(live, 'customer')) return auditOpenLabel('books_customers')
    if (textOf(live, 'vendor')) return auditOpenLabel('books_vendors')
    return auditOpenLabel(collection)
}
