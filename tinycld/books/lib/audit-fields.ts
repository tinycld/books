// How a record's history writes each field of an audited Books collection (spec §3
// Events): its label and the kind of its values. tests/audit-fields.test.ts compares each
// map with the collection's fields as the migrations define them (the generated zod
// schema), so a new field fails a test until it is labelled here.
import { dateTimeText } from '@tinycld/core/reports/lib/date-time'
import { shortDay } from '@tinycld/core/reports/lib/dates'
import type { SelectOption } from '@tinycld/core/reports/lib/types'
import { ACCOUNT_TYPES } from './account-types'
import type { AuditEvent, AuditFieldChange, AuditLogRow } from './audit-log'
import { AMOUNT_COLUMNS_OPTIONS, SIGN_OPTIONS } from './bank-import-view'
import { txnStatusLabel } from './bank-review'
import { ENTRY_TYPE_LABELS } from './entry-messages'
import { EXEMPTION_REASONS } from './exemption-reasons'
import { BOXES_1099, box1099Label } from './form-1099'
import { formatMoney } from './money'
import { PAYMENT_METHODS } from './payment-methods'
import { PAYMENT_TERMS } from './payment-terms'
import { PRODUCT_TYPES } from './product-types'
import { PURCHASE_LINES_OPTIONS } from './purchase-lines'
import { isIsoDay } from './register-range'
import { ratePercentText } from './sales-tax'
import { isSendDocType } from './send-doc-types'
import { STATEMENT_TYPE_LABELS } from './statement-texts'
import { TAX_ID_TYPES } from './tax-id'

// `money`: integer cents in the record's currency. `day`: a text day (YYYY-MM-DD).
// `datetime`: an instant (posted at, voided at), in the reader's zone. `percent`: parts
// per million (a tax rate, a percent line). `hidden`: redacted by core for every reader.
// `internal`: never a person's change (sort and name keys, custom field JSON, stamps).
export type AuditFieldKind =
    | 'text'
    | 'money'
    | 'day'
    | 'datetime'
    | 'percent'
    | 'bool'
    | 'select'
    | 'relation'
    | 'hidden'
    | 'internal'

export type AuditField = {
    label: string
    kind: AuditFieldKind
    options?: readonly SelectOption[]
    target?: string
}

export type AuditFieldMap = Record<string, AuditField>

// One row of an event's Field | Before | After table (or Field | Value for a delete,
// where `before` is undefined): the field's key, its label, how its values read, and the
// raw values (FieldValue writes them in words).
export type AuditFieldRow = {
    key: string
    label: string
    field: AuditField
    before: unknown
    after: unknown
}

// --- Field builders. ---

const text = (label: string): AuditField => ({ label, kind: 'text' })
const money = (label: string): AuditField => ({ label, kind: 'money' })
const day = (label: string): AuditField => ({ label, kind: 'day' })
const datetime = (label: string): AuditField => ({ label, kind: 'datetime' })
const percent = (label: string): AuditField => ({ label, kind: 'percent' })
const bool = (label: string): AuditField => ({ label, kind: 'bool' })
const hidden = (label: string): AuditField => ({ label, kind: 'hidden' })
const internal = (label: string): AuditField => ({ label, kind: 'internal' })
const relation = (label: string, target: string): AuditField => ({
    label,
    kind: 'relation',
    target,
})
const select = (label: string, options: readonly SelectOption[]): AuditField => ({
    label,
    kind: 'select',
    options,
})

function optionsOf(list: readonly { key: string; label: string }[]): SelectOption[] {
    return list.map(entry => ({ value: entry.key, label: entry.label }))
}

// --- Select options, as the Books forms and lists label them. ---

const DOCUMENT_STATUS = [
    { value: 'draft', label: 'Draft' },
    { value: 'posted', label: 'Posted' },
    { value: 'void', label: 'Void' },
]
const ESTIMATE_STATUS = [
    { value: 'pending', label: 'Pending' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'closed', label: 'Closed' },
]
const PURCHASE_ORDER_STATUS = [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
]
// Why an order closed (2100000048): by an admin, or the server when every line is received.
const PURCHASE_ORDER_CLOSED_REASON = [
    { value: 'manual', label: 'Closed by hand' },
    { value: 'received', label: 'Every line received' },
]
const TERMS = optionsOf(PAYMENT_TERMS)
const PAYMENT_METHOD = optionsOf(PAYMENT_METHODS)
const ACCOUNT_TYPE = optionsOf(ACCOUNT_TYPES)
const DETAIL_TYPE = [
    ...new Map(
        ACCOUNT_TYPES.flatMap(type => type.detailTypes).map(detail => [detail.key, detail.label])
    ),
].map(([value, label]) => ({ value, label }))
const BOX_1099 = BOXES_1099.map(box => ({ value: box.key, label: box1099Label(box.key) }))
const SALES_LINE_KIND = [
    { value: 'item', label: 'Product or service' },
    { value: 'description', label: 'Description' },
    { value: 'subtotal', label: 'Subtotal' },
    { value: 'percent', label: 'Percent' },
]
const PURCHASE_LINE_KIND = [
    { value: 'account', label: 'Account' },
    { value: 'item', label: 'Product or service' },
]
// Every doc_type of the entries and the sequences (migrations 2100000001 and
// 2100000002); tests/migration-doc-types.test.ts fails when a migration gains one this
// list lacks.
export const DOC_TYPE = [
    { value: 'journal', label: 'Journal entry' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'invoice', label: 'Invoice' },
    { value: 'sales_receipt', label: 'Sales receipt' },
    { value: 'credit_memo', label: 'Credit memo' },
    { value: 'refund_receipt', label: 'Refund receipt' },
    { value: 'estimate', label: 'Estimate' },
    { value: 'bill', label: 'Bill' },
    { value: 'purchase_order', label: 'Purchase order' },
    { value: 'expense', label: 'Expense' },
    { value: 'vendor_credit', label: 'Vendor credit' },
    { value: 'payment', label: 'Payment' },
    { value: 'bill_payment', label: 'Bill payment' },
    { value: 'vendor_refund', label: 'Vendor refund' },
    { value: 'write_off', label: 'Write-off' },
    { value: 'deposit', label: 'Deposit' },
    { value: 'inventory_adjustment', label: 'Inventory adjustment' },
    { value: 'statement', label: 'Statement' },
]
const COSTING_METHOD = [
    { value: 'fifo', label: 'FIFO' },
    { value: 'average', label: 'Average cost' },
]
const ADJUSTMENT_KIND = [
    { value: 'manual', label: 'Adjustment' },
    // A product's opening stock (ADR 3).
    { value: 'opening', label: 'Opening stock' },
    // The server posts one when a later or back-dated document changes what a
    // posted document's stock cost (ADR 3).
    { value: 'recost', label: 'Re-cost' },
]
const SEND_DOC_TYPE = DOC_TYPE.filter(option => isSendDocType(option.value))
const STATEMENT_TYPE = Object.entries(STATEMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
}))
const WRITE_OFF_STATUS = [
    { value: 'posted', label: 'Posted' },
    { value: 'void', label: 'Void' },
]
const ENTRY_ORIGIN = [
    ...Object.entries(ENTRY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    { value: 'document', label: 'Document' },
]
const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
].map((label, index) => ({ value: String(index + 1), label }))
const BANK_FILE_STATUS = [
    { value: 'uploaded', label: 'Uploaded' },
    { value: 'imported', label: 'Imported' },
    { value: 'failed', label: 'Failed' },
]
const BANK_TXN_STATUS = (['for_review', 'reviewed', 'excluded'] as const).map(value => ({
    value,
    label: txnStatusLabel(value),
}))
const BANK_CATEGORIZATION_KIND = [
    { value: 'categorize', label: 'Categorize' },
    { value: 'transfer', label: 'Transfer' },
]
const RECONCILIATION_STATUS = [
    { value: 'in_progress', label: 'In progress' },
    { value: 'finished', label: 'Finished' },
]

// --- Fields every collection shares. ---

const STAMPS = {
    id: internal('Record ID'),
    created: internal('Created'),
    updated: internal('Updated'),
}

// A posting document's header (invoice, sales receipt, credit memo, bill, expense).
function postingFields(self: string): AuditFieldMap {
    return {
        status: select('Status', DOCUMENT_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Date'),
        memo: text('Memo'),
        subtotal: money('Subtotal'),
        total: money('Total'),
        revision: text('Revision'),
        currency: text('Currency'),
        entry: relation('Journal entry', 'books_journal_entries'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        form: internal('Form'),
        fields: internal('Custom fields'),
        sort_key: internal('Sort key'),
        replaces: relation('Replaces', self),
        replaced_by: relation('Replaced by', self),
        ...STAMPS,
    }
}

// A sales document's line (invoice, sales receipt, estimate, credit memo).
function salesLineFields(parent: string, parentLabel: string): AuditFieldMap {
    return {
        [parent]: relation(parentLabel, `books_${parent}s`),
        kind: select('Line type', SALES_LINE_KIND),
        product: relation('Product or service', 'books_products'),
        description: text('Description'),
        quantity: text('Quantity'),
        rate: money('Rate'),
        percent_ppm: percent('Percent'),
        amount: money('Amount'),
        taxable: bool('Taxable'),
        // 0-based; the line event's title already names the line ("Line 2 — Changed").
        position: internal('Position'),
        ...STAMPS,
    }
}

// A purchase document's line (bill, expense, vendor credit).
function purchaseLineFields(parent: string, parentLabel: string): AuditFieldMap {
    return {
        [parent]: relation(parentLabel, `books_${parent}s`),
        kind: select('Line type', PURCHASE_LINE_KIND),
        account: relation('Account', 'books_accounts'),
        product: relation('Product or service', 'books_products'),
        description: text('Description'),
        quantity: text('Quantity'),
        rate: money('Rate'),
        amount: money('Amount'),
        position: internal('Position'),
        ...STAMPS,
    }
}

// A customer's or vendor's contact fields.
const PARTY_NAME_FIELDS: AuditFieldMap = {
    display_name: text('Display name'),
    code: text('Code'),
    company: text('Company'),
    first_name: text('First name'),
    last_name: text('Last name'),
    email: text('Email'),
    phone: text('Phone'),
    mobile: text('Mobile'),
    website: text('Website'),
}

// --- The map. ---

const AUDIT_FIELD_MAPS = {
    books_invoices: {
        customer: relation('Customer', 'books_customers'),
        ...postingFields('books_invoices'),
        due_date: day('Due date'),
        terms: select('Terms', TERMS),
        bill_to: text('Bill to'),
        email: text('Email'),
        tax_rate: relation('Tax rate', 'books_tax_rates'),
        message: text('Message'),
        tax_total: money('Tax'),
        balance: money('Open balance'),
        written_off: money('Written off'),
        estimate: relation('Estimate', 'books_estimates'),
        public_token: hidden('Customer link'),
    },
    books_sales_receipts: {
        customer: relation('Customer', 'books_customers'),
        ...postingFields('books_sales_receipts'),
        bill_to: text('Bill to'),
        email: text('Email'),
        tax_rate: relation('Tax rate', 'books_tax_rates'),
        payment_method: select('Payment method', PAYMENT_METHOD),
        reference_no: text('Reference no.'),
        deposit_to: relation('Deposit to', 'books_accounts'),
        message: text('Message'),
        tax_total: money('Tax'),
    },
    books_estimates: {
        customer: relation('Customer', 'books_customers'),
        status: select('Status', ESTIMATE_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Date'),
        expiration_date: day('Expiration date'),
        accepted_by: text('Accepted by'),
        accepted_date: day('Accepted date'),
        bill_to: text('Bill to'),
        email: text('Email'),
        tax_rate: relation('Tax rate', 'books_tax_rates'),
        message: text('Message'),
        memo: text('Memo'),
        subtotal: money('Subtotal'),
        tax_total: money('Tax'),
        total: money('Total'),
        revision: text('Revision'),
        currency: text('Currency'),
        invoice: relation('Invoice', 'books_invoices'),
        form: internal('Form'),
        fields: internal('Custom fields'),
        public_token: hidden('Customer link'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_estimate_responses: {
        estimate: relation('Estimate', 'books_estimates'),
        decision: select('Decision', [
            { value: 'accepted', label: 'Accepted' },
            { value: 'declined', label: 'Declined' },
        ]),
        name: text('Name'),
        reason: text('Reason'),
        ...STAMPS,
    },
    books_credit_memos: {
        customer: relation('Customer', 'books_customers'),
        ...postingFields('books_credit_memos'),
        date: day('Credit memo date'),
        bill_to: text('Bill to'),
        email: text('Email'),
        tax_rate: relation('Tax rate', 'books_tax_rates'),
        message: text('Message'),
        tax_total: money('Tax'),
        balance: money('Unapplied credit'),
        applied: money('Applied'),
        invoice: relation('Invoice', 'books_invoices'),
    },
    books_refund_receipts: {
        customer: relation('Customer', 'books_customers'),
        ...postingFields('books_refund_receipts'),
        date: day('Refund date'),
        bill_to: text('Bill to'),
        email: text('Email'),
        tax_rate: relation('Tax rate', 'books_tax_rates'),
        payment_method: select('Payment method', PAYMENT_METHOD),
        reference_no: text('Reference no.'),
        refund_from: relation('Refund from', 'books_accounts'),
        sales_receipt: relation('Sales receipt', 'books_sales_receipts'),
        credit_memo: relation('Credit memo', 'books_credit_memos'),
        message: text('Message'),
        tax_total: money('Tax'),
    },
    books_bills: {
        vendor: relation('Vendor', 'books_vendors'),
        ...postingFields('books_bills'),
        date: day('Bill date'),
        due_date: day('Due date'),
        terms: select('Terms', TERMS),
        mailing_address: text('Mailing address'),
        ref_no: text('Vendor’s bill no.'),
        balance: money('Open balance'),
        purchase_order: relation('Purchase order', 'books_purchase_orders'),
    },
    books_expenses: {
        vendor: relation('Vendor', 'books_vendors'),
        paid_from: relation('Paid from', 'books_accounts'),
        payment_method: select('Payment method', PAYMENT_METHOD),
        reference_no: text('Ref no.'),
        ...postingFields('books_expenses'),
        date: day('Payment date'),
    },
    books_vendor_credits: {
        vendor: relation('Vendor', 'books_vendors'),
        ...postingFields('books_vendor_credits'),
        date: day('Credit date'),
        ref_no: text('Vendor’s credit no.'),
        balance: money('Unapplied credit'),
    },
    books_purchase_orders: {
        vendor: relation('Vendor', 'books_vendors'),
        status: select('Status', PURCHASE_ORDER_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Order date'),
        mailing_address: text('Mailing address'),
        email: text('Email'),
        ship_to: text('Ship to'),
        message: text('Message'),
        memo: text('Memo'),
        subtotal: money('Subtotal'),
        total: money('Total'),
        open_amount: money('Open amount'),
        currency: text('Currency'),
        closed_reason: select('Closed because', PURCHASE_ORDER_CLOSED_REASON),
        closed_by: relation('Closed by', 'users'),
        closed_at: datetime('Closed at'),
        created_by: relation('Created by', 'users'),
        revision: text('Revision'),
        form: internal('Form'),
        fields: internal('Custom fields'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_vendor_credit_applications: {
        vendor_credit: relation('Vendor credit', 'books_vendor_credits'),
        bill: relation('Bill', 'books_bills'),
        amount: money('Credit applied'),
        date: day('Apply date'),
        applied_by: relation('Applied by', 'users'),
        close_override: relation('Close date override', 'books_close_overrides'),
        id: STAMPS.id,
        created: STAMPS.created,
    },
    books_credit_memo_applications: {
        credit_memo: relation('Credit memo', 'books_credit_memos'),
        invoice: relation('Invoice', 'books_invoices'),
        amount: money('Credit applied'),
        date: day('Apply date'),
        applied_by: relation('Applied by', 'users'),
        close_override: relation('Close date override', 'books_close_overrides'),
        id: STAMPS.id,
        created: STAMPS.created,
    },
    books_payments: {
        customer: relation('Customer', 'books_customers'),
        status: select('Status', DOCUMENT_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Payment date'),
        payment_method: select('Payment method', PAYMENT_METHOD),
        reference_no: text('Reference no.'),
        deposit_to: relation('Deposit to', 'books_accounts'),
        amount: money('Amount received'),
        applied: money('Applied'),
        credited: money('Credited'),
        memo: text('Memo'),
        currency: text('Currency'),
        entry: relation('Journal entry', 'books_journal_entries'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        sort_key: internal('Sort key'),
        replaces: relation('Replaces', 'books_payments'),
        replaced_by: relation('Replaced by', 'books_payments'),
        ...STAMPS,
    },
    books_payment_applications: {
        payment: relation('Payment', 'books_payments'),
        invoice: relation('Invoice', 'books_invoices'),
        amount: money('Payment'),
        position: internal('Position'),
        ...STAMPS,
    },
    books_bill_payments: {
        vendor: relation('Vendor', 'books_vendors'),
        paid_from: relation('Paid from', 'books_accounts'),
        payment_method: select('Payment method', PAYMENT_METHOD),
        reference_no: text('Check no.'),
        status: select('Status', DOCUMENT_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Payment date'),
        total: money('Amount paid'),
        currency: text('Currency'),
        entry: relation('Journal entry', 'books_journal_entries'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        sort_key: internal('Sort key'),
        replaces: relation('Replaces', 'books_bill_payments'),
        replaced_by: relation('Replaced by', 'books_bill_payments'),
        ...STAMPS,
    },
    books_bill_payment_lines: {
        payment: relation('Bill payment', 'books_bill_payments'),
        bill: relation('Bill', 'books_bills'),
        amount: money('Payment'),
        position: internal('Position'),
        ...STAMPS,
    },
    books_vendor_refunds: {
        vendor: relation('Vendor', 'books_vendors'),
        status: select('Status', DOCUMENT_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Refund date'),
        payment_method: select('Payment method', PAYMENT_METHOD),
        reference_no: text('Reference no.'),
        refunded_to: relation('Refunded to', 'books_accounts'),
        amount: money('Amount refunded'),
        memo: text('Memo'),
        currency: text('Currency'),
        entry: relation('Journal entry', 'books_journal_entries'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        sort_key: internal('Sort key'),
        replaces: relation('Replaces', 'books_vendor_refunds'),
        replaced_by: relation('Replaced by', 'books_vendor_refunds'),
        ...STAMPS,
    },
    books_write_offs: {
        invoice: relation('Invoice', 'books_invoices'),
        customer: relation('Customer', 'books_customers'),
        status: select('Status', WRITE_OFF_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Write-off date'),
        account: relation('Written off to', 'books_accounts'),
        amount: money('Amount written off'),
        memo: text('Reason'),
        currency: text('Currency'),
        entry: relation('Journal entry', 'books_journal_entries'),
        close_override: relation('Close date override', 'books_close_overrides'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_statements: {
        customer: relation('Customer', 'books_customers'),
        number: text('No.'),
        sequence: text('Sequence'),
        type: select('Type', STATEMENT_TYPE),
        statement_date: day('Statement date'),
        start_date: day('Start date'),
        end_date: day('End date'),
        email: text('Email address'),
        balance: money('Amount due'),
        currency: text('Currency'),
        sent_at: datetime('Sent'),
        sent_to: text('Sent to'),
        ...STAMPS,
    },
    // A sent email has no updated stamp: only the send route writes it, once.
    books_document_sends: {
        doc_type: select('Document type', SEND_DOC_TYPE),
        document: internal('Document'),
        number: text('No.'),
        customer: relation('Customer', 'books_customers'),
        vendor: relation('Vendor', 'books_vendors'),
        to: text('To'),
        cc: text('Cc'),
        subject: text('Subject'),
        body: internal('Message HTML'),
        body_text: text('Message'),
        sent_by: relation('Sent by', 'users'),
        id: STAMPS.id,
        created: STAMPS.created,
    },
    books_vendor_refund_lines: {
        refund: relation('Vendor refund', 'books_vendor_refunds'),
        vendor_credit: relation('Vendor credit', 'books_vendor_credits'),
        amount: money('Refund'),
        position: internal('Position'),
        ...STAMPS,
    },
    books_deposits: {
        status: select('Status', DOCUMENT_STATUS),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Deposit date'),
        deposit_to: relation('Deposit to', 'books_accounts'),
        memo: text('Memo'),
        total: money('Deposit total'),
        items_total: money('Selected items'),
        lines_total: money('Other funds'),
        currency: text('Currency'),
        entry: relation('Journal entry', 'books_journal_entries'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        sort_key: internal('Sort key'),
        replaces: relation('Replaces', 'books_deposits'),
        replaced_by: relation('Replaced by', 'books_deposits'),
        ...STAMPS,
    },
    // The server copies every field from `entry` on from the item's journal line, its
    // entry and its source document.
    books_deposit_items: {
        deposit: relation('Deposit', 'books_deposits'),
        line: relation('Journal line', 'books_journal_lines'),
        position: internal('Position'),
        entry: relation('Journal entry', 'books_journal_entries'),
        account: relation('Account', 'books_accounts'),
        customer: relation('Customer', 'books_customers'),
        vendor: relation('Vendor', 'books_vendors'),
        amount: money('Amount'),
        date: day('Date'),
        doc_type: select('Type', DOC_TYPE),
        number: text('Number'),
        document: text('Document'),
        payment_method: select('Payment method', PAYMENT_METHOD),
        reference_no: text('Reference no.'),
        posted: bool('Deposited'),
        ...STAMPS,
    },
    books_deposit_lines: {
        deposit: relation('Deposit', 'books_deposits'),
        customer: relation('Customer', 'books_customers'),
        vendor: relation('Vendor', 'books_vendors'),
        account: relation('Account', 'books_accounts'),
        description: text('Description'),
        amount: money('Amount'),
        position: internal('Position'),
        ...STAMPS,
    },
    // The server fills number, sequence, currency, entry, the stamps and, on an
    // adjustment it makes itself, source and document (the document it re-costs).
    books_inventory_adjustments: {
        status: select('Status', DOCUMENT_STATUS),
        kind: select('Kind', ADJUSTMENT_KIND),
        number: text('Number'),
        sequence: text('Sequence'),
        date: day('Adjustment date'),
        account: relation('Adjustment account', 'books_accounts'),
        memo: text('Memo'),
        source: internal('Source collection'),
        document: internal('Source document'),
        currency: text('Currency'),
        entry: relation('Journal entry', 'books_journal_entries'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        sort_key: internal('Sort key'),
        // The server writes value_change at the post and replaced_by when a correction
        // posts; replaces is set on create only.
        value_change: money('Total value change'),
        replaces: relation('Replaces', 'books_inventory_adjustments'),
        replaced_by: relation('Replaced by', 'books_inventory_adjustments'),
        ...STAMPS,
    },
    books_inventory_adjustment_lines: {
        adjustment: relation('Inventory adjustment', 'books_inventory_adjustments'),
        product: relation('Product or service', 'books_products'),
        bin: relation('Bin location', 'books_bins'),
        quantity: text('Quantity change'),
        value: money('Value change'),
        value_given: bool('Value change typed'),
        // The server writes posted_value at the post.
        posted_value: money('Posted value'),
        position: internal('Position'),
        ...STAMPS,
    },
    // The server trims the name and fills sort_key (server/bins.go).
    books_bins: {
        name: text('Name'),
        note: text('Note'),
        inactive: bool('Inactive'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    // Never edited or deleted; created_by is stamped from the request's user. An empty
    // bin is No bin.
    books_bin_transfers: {
        product: relation('Product or service', 'books_products'),
        from_bin: relation('From bin', 'books_bins'),
        to_bin: relation('To bin', 'books_bins'),
        quantity: text('Quantity'),
        memo: text('Memo'),
        created_by: relation('Moved by', 'users'),
        id: internal('Record ID'),
        created: internal('Created'),
    },
    books_attachments: {
        bill: relation('Bill', 'books_bills'),
        expense: relation('Expense', 'books_expenses'),
        vendor_credit: relation('Vendor credit', 'books_vendor_credits'),
        field: text('Custom field'),
        file: text('File'),
        thumbnail: internal('Thumbnail'),
        name: text('File name'),
        size: text('Size'),
        uploaded_by: relation('Uploaded by', 'users'),
        ...STAMPS,
    },
    books_journal_entries: {
        date: day('Date'),
        status: select('Status', DOCUMENT_STATUS),
        doc_type: select('Type', DOC_TYPE),
        origin: select('Origin', ENTRY_ORIGIN),
        document: text('Document'),
        card_payment: bool('Card payment'),
        number: text('Number'),
        sequence: text('Sequence'),
        memo: text('Memo'),
        total: money('Total'),
        revision: text('Revision'),
        currency: text('Currency'),
        auto_reverse_on: day('Reverse on'),
        posted_at: datetime('Posted at'),
        posted_by: relation('Posted by', 'users'),
        voided_at: datetime('Voided at'),
        voided_by: relation('Voided by', 'users'),
        created_by: relation('Created by', 'users'),
        close_override: relation('Close date override', 'books_close_overrides'),
        reverses: relation('Reverses', 'books_journal_entries'),
        replaces: relation('Replaces', 'books_journal_entries'),
        ...STAMPS,
    },
    books_invoice_lines: salesLineFields('invoice', 'Invoice'),
    books_sales_receipt_lines: salesLineFields('sales_receipt', 'Sales receipt'),
    books_estimate_lines: salesLineFields('estimate', 'Estimate'),
    books_credit_memo_lines: salesLineFields('credit_memo', 'Credit memo'),
    books_refund_receipt_lines: salesLineFields('refund_receipt', 'Refund receipt'),
    books_bill_lines: {
        ...purchaseLineFields('bill', 'Bill'),
        po_line: relation('Purchase order line', 'books_purchase_order_lines'),
    },
    books_expense_lines: purchaseLineFields('expense', 'Expense'),
    books_vendor_credit_lines: purchaseLineFields('vendor_credit', 'Vendor credit'),
    // The server writes received, billed and the open values (2100000048).
    books_purchase_order_lines: {
        ...purchaseLineFields('purchase_order', 'Purchase order'),
        received: text('Received'),
        billed: money('Billed'),
        open_quantity: text('Open quantity'),
        open_amount: money('Open amount'),
    },
    books_journal_lines: {
        entry: relation('Journal entry', 'books_journal_entries'),
        account: relation('Account', 'books_accounts'),
        debit: money('Debit'),
        credit: money('Credit'),
        memo: text('Description'),
        position: internal('Position'),
        posted: bool('Posted'),
        date: day('Date'),
        currency: text('Currency'),
        customer: relation('Customer', 'books_customers'),
        vendor: relation('Vendor', 'books_vendors'),
        // Copies of the entry's card mark and type (server/lines.go).
        card_payment: bool('Card payment'),
        doc_type: select('Type', DOC_TYPE),
        ...STAMPS,
    },
    books_accounts: {
        name: text('Name'),
        full_name: text('Full name'),
        number: text('Number'),
        type: select('Account type', ACCOUNT_TYPE),
        detail_type: select('Detail type', DETAIL_TYPE),
        description: text('Description'),
        inactive: bool('Inactive'),
        currency: text('Currency'),
        form_1099_box: select('1099 box', BOX_1099),
        parent: relation('Parent account', 'books_accounts'),
        ...STAMPS,
    },
    books_customers: {
        ...PARTY_NAME_FIELDS,
        billing_address: text('Billing address'),
        shipping_address: text('Shipping address'),
        notes: text('Notes'),
        inactive: bool('Inactive'),
        terms: select('Terms', TERMS),
        parent: relation('Parent customer', 'books_customers'),
        tax_exempt: bool('Tax exempt'),
        exemption_reason: select('Exemption reason', optionsOf(EXEMPTION_REASONS)),
        exemption_number: text('Exemption number'),
        default_tax_rate: relation('Default tax rate', 'books_tax_rates'),
        form: internal('Form'),
        fields: internal('Custom fields'),
        name_key: internal('Name key'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_vendors: {
        ...PARTY_NAME_FIELDS,
        address: text('Address'),
        terms: select('Terms', TERMS),
        account_number: text('Account no.'),
        expense_account: relation('Default expense account', 'books_accounts'),
        notes: text('Notes'),
        track_1099: bool('Track payments for 1099'),
        legal_name: text('Legal name'),
        tax_id_type: select('Tax ID type', optionsOf(TAX_ID_TYPES)),
        tax_id: hidden('Tax ID'),
        inactive: bool('Inactive'),
        form: internal('Form'),
        fields: internal('Custom fields'),
        name_key: internal('Name key'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_party_contacts: {
        customer: relation('Customer', 'books_customers'),
        vendor: relation('Vendor', 'books_vendors'),
        name: text('Name'),
        role: text('Role'),
        email: text('Email'),
        phone: text('Phone'),
        is_primary: bool('Primary contact'),
        ...STAMPS,
    },
    books_products: {
        type: select('Type', optionsOf(PRODUCT_TYPES)),
        name: text('Name'),
        code: text('Code'),
        vendor_part_no: text('Vendor part no.'),
        sales_description: text('Sales description'),
        price: money('Price'),
        income_account: relation('Income account', 'books_accounts'),
        purchases: bool('I buy this'),
        purchase_description: text('Purchase description'),
        cost: money('Cost'),
        expense_account: relation('Expense account', 'books_accounts'),
        asset_account: relation('Inventory asset account', 'books_accounts'),
        preferred_vendor: relation('Preferred vendor', 'books_vendors'),
        reorder_point: text('Reorder point'),
        opening_quantity: text('Opening quantity'),
        opening_value: money('Opening value'),
        opening_date: day('Opening stock as of'),
        quantity_on_hand: text('Quantity on hand'),
        stock_value: money('Stock value'),
        quantity_on_po: text('Quantity on purchase orders'),
        // The server keeps low_stock (reorder point above 0 and on hand at or below it).
        default_bin: relation('Default bin', 'books_bins'),
        low_stock: bool('Low stock'),
        inactive: bool('Inactive'),
        currency: text('Currency'),
        taxable: bool('Taxable'),
        form: internal('Form'),
        fields: internal('Custom fields'),
        name_key: internal('Name key'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_bundle_items: {
        bundle: relation('Bundle', 'books_products'),
        product: relation('Product or service', 'books_products'),
        quantity: text('Quantity'),
        position: internal('Position'),
        ...STAMPS,
    },
    books_tax_agencies: {
        name: text('Name'),
        account: relation('Liability account', 'books_accounts'),
        inactive: bool('Inactive'),
        name_key: internal('Name key'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_tax_rates: {
        type: select('Type', [
            { value: 'rate', label: 'Rate' },
            { value: 'group', label: 'Group' },
        ]),
        name: text('Name'),
        rate_ppm: percent('Rate'),
        agency: relation('Agency', 'books_tax_agencies'),
        is_default: bool('Default rate'),
        inactive: bool('Inactive'),
        components: relation('Rates in the group', 'books_tax_rates'),
        name_key: internal('Name key'),
        sort_key: internal('Sort key'),
        ...STAMPS,
    },
    books_bank_connections: {
        account: relation('Account', 'books_accounts'),
        institution: text('Bank'),
        account_mask: text('Account ending'),
        created_by: relation('Connected by', 'users'),
        ...STAMPS,
    },
    books_bank_files: {
        connection: relation('Bank connection', 'books_bank_connections'),
        file: text('File'),
        name: text('File name'),
        format: select('Format', [
            { value: 'csv', label: 'CSV' },
            { value: 'ofx', label: 'OFX' },
        ]),
        size: text('Size'),
        content_hash: internal('Content hash'),
        status: select('Status', BANK_FILE_STATUS),
        uploaded_by: relation('Uploaded by', 'users'),
        statement_balance: money('Statement balance'),
        statement_date: day('Statement date'),
        ...STAMPS,
    },
    books_bank_imports: {
        file: relation('Bank file', 'books_bank_files'),
        header_row: bool('Header row'),
        date_column: text('Date column'),
        date_format: text('Date format'),
        description_column: text('Description column'),
        amount_columns: select('Amount columns', AMOUNT_COLUMNS_OPTIONS),
        amount_column: text('Amount column'),
        money_in_column: text('Money in column'),
        money_out_column: text('Money out column'),
        amount_sign: select('Positive amounts are', SIGN_OPTIONS),
        lines: internal('Imported lines'),
        imported: text('Imported'),
        duplicates: text('Duplicates'),
        created_by: relation('Imported by', 'users'),
        ...STAMPS,
    },
    books_bank_transactions: {
        connection: relation('Bank connection', 'books_bank_connections'),
        file: relation('Bank file', 'books_bank_files'),
        bank_import: relation('Bank import', 'books_bank_imports'),
        line: text('File line'),
        date: day('Date'),
        description: text('Description'),
        memo: text('Memo'),
        amount: money('Amount'),
        fitid: text('Bank transaction ID'),
        check_number: text('Check no.'),
        dedupe_hash: internal('Duplicate check'),
        status: select('Status', BANK_TXN_STATUS),
        ...STAMPS,
    },
    books_bank_matches: {
        bank_transaction: relation('Bank transaction', 'books_bank_transactions'),
        lines: internal('Matched lines'),
        connection: relation('Bank connection', 'books_bank_connections'),
        created_by: relation('Matched by', 'users'),
        ...STAMPS,
    },
    books_bank_categorizations: {
        bank_transaction: relation('Bank transaction', 'books_bank_transactions'),
        kind: select('Kind', BANK_CATEGORIZATION_KIND),
        customer: relation('Customer', 'books_customers'),
        vendor: relation('Vendor', 'books_vendors'),
        memo: text('Memo'),
        // The posted entry shows the lines; the json is the request the server posted from.
        lines: internal('Categorized lines'),
        connection: relation('Bank connection', 'books_bank_connections'),
        entry: relation('Journal entry', 'books_journal_entries'),
        created_by: relation('Added by', 'users'),
        ...STAMPS,
    },
    // `_out` is the credit side (a bank payment, a card charge), `_in` the debit side.
    books_reconciliations: {
        account: relation('Account', 'books_accounts'),
        statement_date: day('Ending date'),
        statement_balance: money('Ending balance'),
        has_statement_totals: bool('Statement totals entered'),
        statement_out: money('Statement money out'),
        statement_in: money('Statement money in'),
        status: select('Status', RECONCILIATION_STATUS),
        beginning_balance: money('Beginning balance'),
        cleared_out: money('Cleared money out'),
        cleared_in: money('Cleared money in'),
        cleared_out_count: text('Cleared money out count'),
        cleared_in_count: text('Cleared money in count'),
        created_by: relation('Started by', 'users'),
        finished_by: relation('Finished by', 'users'),
        finished_by_name: text('Finished by (name)'),
        finished_at: datetime('Finished at'),
        currency: text('Currency'),
        ...STAMPS,
    },
    books_settings: {
        close_date: day('Close date'),
        fiscal_year_start_month: select('First month of the fiscal year', MONTHS),
        currency: text('Currency'),
        business_name: text('Business name'),
        tax_id: hidden('Tax ID'),
        address: text('Address'),
        phone: text('Phone'),
        email: text('Email'),
        website: text('Website'),
        ownership: select('Ownership', [
            { value: 'owners', label: 'One owner or partners' },
            { value: 'corporation', label: 'Corporation' },
        ]),
        setup_started: internal('Setup started'),
        setup_completed: internal('Setup completed'),
        threshold_1099: money('1099 threshold'),
        default_customer_message: text('Default customer message'),
        purchase_lines: select('Purchase lines', PURCHASE_LINES_OPTIONS),
        sales_deposit_account: relation('Sales deposit account', 'books_accounts'),
        costing_method: select('Inventory costing method', COSTING_METHOD),
        costing_locked: bool('Costing method locked'),
        ...STAMPS,
    },
    books_doc_sequences: {
        doc_type: select('Document type', DOC_TYPE),
        prefix: text('Prefix'),
        next_number: text('Next number'),
        ...STAMPS,
    },
    books_close_overrides: {
        user: relation('User', 'users'),
        reason: text('Reason'),
        expires_at: datetime('Expires at'),
        granted_by: relation('Granted by', 'users'),
        ...STAMPS,
    },
    books_admins: {
        user: relation('User', 'users'),
        ...STAMPS,
    },
} satisfies Record<string, AuditFieldMap>

export const AUDIT_FIELDS: Record<string, AuditFieldMap> = AUDIT_FIELD_MAPS

/** A collection Books registers with core's audit (server/audit.go auditedCollections). */
export type AuditedCollection = keyof typeof AUDIT_FIELD_MAPS

export function isAuditedCollection(collection: string): collection is AuditedCollection {
    return Object.keys(AUDIT_FIELD_MAPS).includes(collection)
}

export function auditFieldsOf(collection: string): AuditFieldMap {
    return AUDIT_FIELDS[collection] ?? {}
}

// A key with no entry, in words: "due_date" → "Due date".
export function fieldLabel(key: string): string {
    const words = key.replace(/_/g, ' ').trim()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

function fieldOf(collection: string, key: string): AuditField {
    return auditFieldsOf(collection)[key] ?? text(fieldLabel(key))
}

// --- Values in words. ---

export const HIDDEN_TEXT = 'Changed (hidden)'
export const EMPTY_TEXT = 'Empty'
export const REMOVED_TEXT = 'Removed record'
// The marker core writes for a redacted value (core server/audit RedactedValue).
const REDACTED_VALUE = '[redacted]'

function isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true
    return Array.isArray(value) && value.length === 0
}

// A JSON value (an address) as one line: its non-empty parts, in order.
function plainText(value: unknown): string {
    if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(', ')
    if (value !== null && typeof value === 'object') {
        return Object.values(value).map(plainText).filter(Boolean).join(', ')
    }
    if (value === null || value === undefined) return ''
    return String(value)
}

function selectLabel(field: AuditField, value: unknown): string {
    const key = String(value)
    return field.options?.find(option => option.value === key)?.label ?? key
}

function dayText(value: unknown): string {
    const day = String(value)
    return isIsoDay(day) ? shortDay(day) : day
}

/**
 * One value of an event's table in words (spec §3 Events). `currency` is the record's
 * own, else the Books currency; `relationName` is the current name of the related record
 * a relation names (null when it no longer exists or the reader cannot read it).
 */
export function fieldValueText(
    field: AuditField,
    value: unknown,
    ctx: { currency: string; relationName?: string | null }
): string {
    if (field.kind === 'hidden') return HIDDEN_TEXT
    if (isEmptyValue(value)) return EMPTY_TEXT
    switch (field.kind) {
        case 'money':
            return formatMoney(Number(value), ctx.currency)
        case 'day':
            return dayText(value)
        case 'datetime':
            return dateTimeText(String(value))
        case 'percent':
            return ratePercentText(Number(value))
        case 'bool':
            return value === true ? 'Yes' : 'No'
        case 'select':
            return selectLabel(field, value)
        case 'relation':
            return ctx.relationName ?? REMOVED_TEXT
        default:
            return plainText(value)
    }
}

function isRedactedChange(change: AuditFieldChange): boolean {
    return 'redacted' in change && change.redacted === true
}

// A redacted value reads as hidden whatever its field's kind.
function asHidden(field: AuditField): AuditField {
    return { ...field, kind: 'hidden' }
}

// The map's order (form order) first, then keys the map does not name.
function inFieldOrder(collection: string, keys: readonly string[]): string[] {
    const order = Object.keys(auditFieldsOf(collection))
    const rank = (key: string) => {
        const at = order.indexOf(key)
        return at === -1 ? order.length : at
    }
    return [...keys].sort((a, b) => rank(a) - rank(b))
}

/**
 * The Field | Before | After rows of a Changed, Posted or Voided event: internal keys
 * dropped, a redacted change hidden in both columns. An empty list means only internal
 * keys changed ("No visible fields changed").
 */
export function changedFieldRows(
    collection: string,
    changes: Record<string, AuditFieldChange> | null
): AuditFieldRow[] {
    if (!changes) return []
    return inFieldOrder(collection, Object.keys(changes)).flatMap(key => {
        const change = changes[key]
        const field = fieldOf(collection, key)
        if (!change || field.kind === 'internal') return []
        const shown = isRedactedChange(change) ? asHidden(field) : field
        return [
            { key, label: field.label, field: shown, before: change.before, after: change.after },
        ]
    })
}

/**
 * The Field | Value rows of a Deleted event: the record's last values from the delete
 * snapshot, by the same rules (`after` holds the value; `before` is undefined).
 */
export function snapshotFieldRows(
    collection: string,
    snapshot: Record<string, unknown> | null
): AuditFieldRow[] {
    if (!snapshot) return []
    return inFieldOrder(collection, Object.keys(snapshot)).flatMap(key => {
        const field = fieldOf(collection, key)
        if (field.kind === 'internal') return []
        const value = snapshot[key]
        const shown = value === REDACTED_VALUE ? asHidden(field) : field
        return [{ key, label: field.label, field: shown, before: undefined, after: value }]
    })
}

// --- Events. ---

const EVENT_WORDS: Record<AuditEvent, string> = {
    added: 'Added',
    changed: 'Changed',
    posted: 'Posted',
    voided: 'Voided',
    deleted: 'Deleted',
}

// A collection whose events read in its own words (apply credit spec §3.8).
const COLLECTION_EVENT_WORDS: Record<string, Partial<Record<AuditEvent, string>>> = {
    books_credit_memo_applications: { added: 'Credit applied', deleted: 'Credit removed' },
    // Only the send route writes a send, and nothing edits it (email-share spec §4.2).
    books_document_sends: { added: 'Sent' },
}

export function eventWords(event: AuditEvent, collection?: string): string {
    const own = collection ? COLLECTION_EVENT_WORDS[collection]?.[event] : undefined
    return own ?? EVENT_WORDS[event]
}

/**
 * The currency an event's money is written in: the record's own `currency` from the
 * event's changes (its new value) or snapshot, else the Books currency.
 */
export function eventCurrency(
    row: Pick<AuditLogRow, 'changes' | 'snapshot'>,
    booksCurrency: string
): string {
    const change = row.changes?.currency
    const changed = change && !isRedactedChange(change) ? change.after : null
    const own = typeof changed === 'string' && changed ? changed : row.snapshot?.currency
    return typeof own === 'string' && own ? own : booksCurrency
}

/** Whether a history row is one of the record's lines (its parent is the record). */
export function isLineEvent(row: Pick<AuditLogRow, 'record_type'>, collection: string): boolean {
    return row.record_type !== collection
}

/**
 * A line event's title (plan P9): "Line <n> — <Event>", n from the line's live
 * `position` (0-based), else the delete snapshot's, else the record label.
 */
export function lineEventTitle(
    row: Pick<AuditLogRow, 'event' | 'record_label' | 'record_type' | 'snapshot'>,
    livePosition: number | null | undefined
): string {
    const position = [livePosition, row.snapshot?.position].find(
        (value): value is number => typeof value === 'number'
    )
    const name = position === undefined ? row.record_label : `Line ${position + 1}`
    return `${name} — ${eventWords(row.event, row.record_type)}`
}
