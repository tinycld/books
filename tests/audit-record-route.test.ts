import { describe, expect, it } from 'vitest'
import {
    auditOpenLabel,
    auditRecordHref,
    auditRecordOpenLabel,
} from '../tinycld/books/lib/audit-record-route'
import { documentHref } from '../tinycld/books/lib/document-routes'
import { entryHref } from '../tinycld/books/lib/entry-route'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    EXPENSE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

const ID = 'bkrecord0000001'

// An attachment's live row: on a bill, or on an expense.
const ON_BILL = { id: ID, bill: 'bkbill00001001', expense: '' }
const ON_EXPENSE = { id: ID, bill: '', expense: 'bkexpense001001' }

const DOCUMENTS = [
    { collection: 'books_invoices', kind: INVOICE_KIND, path: 'books/invoices' },
    { collection: 'books_sales_receipts', kind: SALES_RECEIPT_KIND, path: 'books/sales-receipts' },
    { collection: 'books_credit_memos', kind: CREDIT_MEMO_KIND, path: 'books/credit-memos' },
    { collection: 'books_estimates', kind: ESTIMATE_KIND, path: 'books/estimates' },
    { collection: 'books_bills', kind: BILL_KIND, path: 'books/bills' },
    { collection: 'books_expenses', kind: EXPENSE_KIND, path: 'books/expenses' },
]

// Records with a screen of their own: the filled path, never the `[id]` route pattern.
const RECORDS = [
    { collection: 'books_customers', path: `books/customers/${ID}` },
    { collection: 'books_vendors', path: `books/vendors/${ID}` },
    { collection: 'books_products', path: `books/products/${ID}` },
    { collection: 'books_accounts', path: `books/accounts/${ID}` },
    { collection: 'books_payments', path: `books/payments/${ID}` },
    // Pay bills (cp 4 item D2): a bill payment's history opens its read view.
    { collection: 'books_bill_payments', path: `books/bill-payments/${ID}` },
]

// Records shown on a screen that holds a group of them.
const GROUPS = [
    { collection: 'books_tax_agencies', path: 'books/taxes', label: 'Open taxes' },
    { collection: 'books_tax_rates', path: 'books/taxes', label: 'Open taxes' },
    { collection: 'books_settings', path: 'books/settings', label: 'Open settings' },
    { collection: 'books_doc_sequences', path: 'books/settings', label: 'Open settings' },
    { collection: 'books_close_overrides', path: 'books/settings', label: 'Open settings' },
    { collection: 'books_admins', path: 'books/settings', label: 'Open settings' },
    { collection: 'books_bank_connections', path: 'books/banking', label: 'Open banking' },
    { collection: 'books_bank_files', path: 'books/banking', label: 'Open banking' },
    { collection: 'books_bank_imports', path: 'books/banking', label: 'Open banking' },
    { collection: 'books_bank_transactions', path: 'books/banking', label: 'Open banking' },
]

describe('auditRecordHref', () => {
    it.each(DOCUMENTS)('$collection opens its document’s read view', ({
        collection,
        kind,
        path,
    }) => {
        const href = auditRecordHref(collection, ID, { id: ID })
        expect(href).toBe(documentHref(kind, ID))
        expect(href).toBe(`${path}/${ID}`)
    })

    // A credit memo line's audit rows are filed under its memo (parent_type
    // books_credit_memos, parent_id the memo id: migration 2100000024), so the history of a
    // line is the memo's, and its Open is the memo's read view.
    it('a credit memo record, and the memo id a line’s history is filed under, open books/credit-memos/<id>', () => {
        expect(auditRecordHref('books_credit_memos', ID, { id: ID })).toBe(
            `books/credit-memos/${ID}`
        )
    })

    it('opens a journal entry where its live row says (entryHref)', () => {
        const manual = { id: ID, doc_type: 'journal', origin: 'manual', document: '' } as const
        expect(auditRecordHref('books_journal_entries', ID, manual)).toBe(entryHref(manual))
        expect(auditRecordHref('books_journal_entries', ID, manual)).toBe(`books/entries/${ID}`)

        const transfer = { id: ID, doc_type: 'transfer', origin: 'manual', document: '' } as const
        expect(auditRecordHref('books_journal_entries', ID, transfer)).toBe(`books/transfers/${ID}`)

        const posted = {
            id: ID,
            doc_type: 'invoice',
            origin: 'document',
            document: 'bkinvoice001001',
        } as const
        expect(auditRecordHref('books_journal_entries', ID, posted)).toBe(entryHref(posted))

        const payment = {
            id: ID,
            doc_type: 'payment',
            origin: 'document',
            document: 'bkpayment001001',
        } as const
        expect(auditRecordHref('books_journal_entries', ID, payment)).toBe(
            'books/payments/bkpayment001001'
        )
    })

    // Vendor credit spec §3.12: a vendor credit's entry opens on its credit, and its void
    // reversal as an entry.
    it('opens a vendor credit’s entry on its credit, and its void reversal as an entry', () => {
        const posted = {
            id: ID,
            doc_type: 'vendor_credit',
            origin: 'document',
            document: 'vcrd1001pacpw01',
        } as const
        expect(auditRecordHref('books_journal_entries', ID, posted)).toBe(
            'books/vendor-credits/vcrd1001pacpw01'
        )
        const reversal = { ...posted, origin: 'void_reversal', document: '' } as const
        expect(auditRecordHref('books_journal_entries', ID, reversal)).toBe(`books/entries/${ID}`)
    })

    it('opens an attachment’s bill or expense', () => {
        expect(auditRecordHref('books_attachments', ID, ON_BILL)).toBe('books/bills/bkbill00001001')
        expect(auditRecordHref('books_attachments', ID, ON_EXPENSE)).toBe(
            'books/expenses/bkexpense001001'
        )
        expect(auditRecordHref('books_attachments', ID, undefined)).toBeNull()
    })

    it.each(RECORDS)('$collection opens $path', ({ collection, path }) => {
        expect(auditRecordHref(collection, ID, { id: ID })).toBe(path)
    })

    it('opens a party contact’s customer or vendor', () => {
        expect(
            auditRecordHref('books_party_contacts', ID, { id: ID, customer: 'bkcust000northw' })
        ).toBe('books/customers/bkcust000northw')
        expect(
            auditRecordHref('books_party_contacts', ID, {
                id: ID,
                customer: '',
                vendor: 'bkvendcascade01',
            })
        ).toBe('books/vendors/bkvendcascade01')
    })

    it.each(GROUPS)('$collection opens $path', ({ collection, path }) => {
        expect(auditRecordHref(collection, ID, { id: ID })).toBe(path)
    })

    // The same records with no live row (deleted, or unreadable) open nothing; each check
    // first proves the record opens while its live row is there.
    it.each([
        ...DOCUMENTS,
        ...RECORDS,
        ...GROUPS,
        { collection: 'books_journal_entries' },
    ])('$collection: opens while live, and nothing once deleted or unreadable', ({
        collection,
    }) => {
        const live = { id: ID, doc_type: 'journal', origin: 'manual', document: '' }
        expect(auditRecordHref(collection, ID, live)).not.toBeNull()
        expect(auditRecordHref(collection, ID, undefined)).toBeNull()
    })
})

describe('auditOpenLabel', () => {
    it('names the record type in words, lower-cased', () => {
        expect(auditOpenLabel('books_invoices')).toBe('Open invoice')
        expect(auditOpenLabel('books_journal_entries')).toBe('Open journal entry')
        expect(auditOpenLabel('books_customers')).toBe('Open customer')
        expect(auditOpenLabel('books_products')).toBe('Open product or service')
        expect(auditOpenLabel('books_bill_payments')).toBe('Open bill payment')
    })

    it.each(GROUPS)('$collection: $label', ({ collection, label }) => {
        expect(auditOpenLabel(collection)).toBe(label)
    })
})

describe('auditRecordOpenLabel', () => {
    it('names a customer’s contact by the customer screen it opens', () => {
        const live = { id: ID, customer: 'bkcust000northw', vendor: '' }
        expect(auditRecordOpenLabel('books_party_contacts', live)).toBe('Open customer')
    })

    it('names a vendor’s contact by the vendor screen it opens', () => {
        const live = { id: ID, customer: '', vendor: 'bkvendcascade01' }
        expect(auditRecordOpenLabel('books_party_contacts', live)).toBe('Open vendor')
    })

    it('names an attachment by the document screen it opens', () => {
        expect(auditRecordOpenLabel('books_attachments', ON_BILL)).toBe('Open bill')
        expect(auditRecordOpenLabel('books_attachments', ON_EXPENSE)).toBe('Open expense')
    })

    it('names any other record by its own type', () => {
        expect(auditRecordOpenLabel('books_invoices', { id: ID })).toBe('Open invoice')
    })
})
