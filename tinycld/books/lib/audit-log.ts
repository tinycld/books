// The `books_audit_log` view's row and option types the app reads at runtime (record
// history, the audit fields). The reference fixture re-exports them; the app never
// imports the fixture.
import type { CellValue, SelectOption } from '@tinycld/core/reports/lib/types'
import type { BooksAuditLog } from '../types'

export type AuditEvent = 'added' | 'changed' | 'posted' | 'voided' | 'deleted'

/** One changed field, as core's audit ComputeDiff writes it. */
export type AuditFieldChange =
    | { before: CellValue; after: CellValue }
    | { before: '[redacted]'; after: '[redacted]'; redacted: true }

/**
 * A row of the `books_audit_log` view (spec §5): the generated record type, with
 * the computed `event` and the JSON columns narrowed. The generator types a JSON
 * column as `any`, and `any` in an intersection swallows the narrowing, so those
 * columns are omitted first.
 */
export type AuditLogRow = Omit<BooksAuditLog, 'event' | 'changes' | 'snapshot'> & {
    event: AuditEvent
    changes: Record<string, AuditFieldChange> | null
    snapshot: Record<string, CellValue> | null
}

// --- Options (the Go source's select options; server/audit.go builds the same). ---

export const AUDIT_EVENT_OPTIONS: SelectOption[] = [
    { value: 'added', label: 'Added' },
    { value: 'changed', label: 'Changed' },
    { value: 'posted', label: 'Posted' },
    { value: 'voided', label: 'Voided' },
    { value: 'deleted', label: 'Deleted' },
]

// The Event column's options, the view's event_shown (auditShownEvents in
// server/audit.go): the events, then a credit memo application's create and delete.
export const AUDIT_SHOWN_EVENT_OPTIONS: SelectOption[] = [
    ...AUDIT_EVENT_OPTIONS,
    { value: 'credit_applied', label: 'Credit applied' },
    { value: 'credit_removed', label: 'Credit removed' },
]

// In the order of the Record type param: Documents, Lines, Lists, Banking, Settings
// and access (auditRecordTypeOptions in server/audit.go).
export const AUDIT_RECORD_TYPE_OPTIONS: SelectOption[] = [
    { value: 'books_invoices', label: 'Invoice' },
    { value: 'books_sales_receipts', label: 'Sales receipt' },
    { value: 'books_estimates', label: 'Estimate' },
    { value: 'books_estimate_responses', label: 'Estimate response' },
    { value: 'books_credit_memos', label: 'Credit memo' },
    { value: 'books_refund_receipts', label: 'Refund receipt' },
    { value: 'books_write_offs', label: 'Write-off' },
    { value: 'books_statements', label: 'Customer statement' },
    { value: 'books_bills', label: 'Bill' },
    { value: 'books_expenses', label: 'Expense' },
    { value: 'books_vendor_credits', label: 'Vendor credit' },
    { value: 'books_payments', label: 'Payment' },
    { value: 'books_bill_payments', label: 'Bill payment' },
    { value: 'books_vendor_refunds', label: 'Vendor refund' },
    { value: 'books_journal_entries', label: 'Journal entry' },
    { value: 'books_invoice_lines', label: 'Invoice line' },
    { value: 'books_sales_receipt_lines', label: 'Sales receipt line' },
    { value: 'books_estimate_lines', label: 'Estimate line' },
    { value: 'books_credit_memo_lines', label: 'Credit memo line' },
    { value: 'books_refund_receipt_lines', label: 'Refund receipt line' },
    { value: 'books_bill_lines', label: 'Bill line' },
    { value: 'books_expense_lines', label: 'Expense line' },
    { value: 'books_vendor_credit_lines', label: 'Vendor credit line' },
    { value: 'books_payment_applications', label: 'Payment application' },
    { value: 'books_bill_payment_lines', label: 'Bill payment line' },
    { value: 'books_vendor_credit_applications', label: 'Vendor credit application' },
    { value: 'books_credit_memo_applications', label: 'Credit memo application' },
    { value: 'books_vendor_refund_lines', label: 'Vendor refund line' },
    { value: 'books_journal_lines', label: 'Journal line' },
    { value: 'books_attachments', label: 'Attachment' },
    { value: 'books_accounts', label: 'Account' },
    { value: 'books_customers', label: 'Customer' },
    { value: 'books_vendors', label: 'Vendor' },
    { value: 'books_party_contacts', label: 'Contact' },
    { value: 'books_products', label: 'Product or service' },
    { value: 'books_bundle_items', label: 'Bundle item' },
    { value: 'books_tax_agencies', label: 'Tax agency' },
    { value: 'books_tax_rates', label: 'Tax rate' },
    { value: 'books_bank_connections', label: 'Bank connection' },
    { value: 'books_bank_files', label: 'Bank file' },
    { value: 'books_bank_imports', label: 'Bank import' },
    { value: 'books_bank_transactions', label: 'Bank transaction' },
    { value: 'books_bank_matches', label: 'Bank match' },
    { value: 'books_settings', label: 'Books settings' },
    { value: 'books_doc_sequences', label: 'Document numbering' },
    { value: 'books_close_overrides', label: 'Close date override' },
    { value: 'books_admins', label: 'Books admin' },
]

export function recordTypeLabel(collection: string): string {
    return AUDIT_RECORD_TYPE_OPTIONS.find(o => o.value === collection)?.label ?? collection
}
