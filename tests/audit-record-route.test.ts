import { describe, expect, it } from 'vitest'
import { auditOpenLabel, auditRecordHref } from '../tinycld/books/lib/audit-record-route'
import { documentHref } from '../tinycld/books/lib/document-routes'
import { entryHref } from '../tinycld/books/lib/entry-route'
import {
    BILL_KIND,
    ESTIMATE_KIND,
    EXPENSE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

const ID = 'bkrecord0000001'

const DOCUMENTS = [
    { collection: 'books_invoices', kind: INVOICE_KIND, path: 'books/invoices' },
    { collection: 'books_sales_receipts', kind: SALES_RECEIPT_KIND, path: 'books/sales-receipts' },
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
    })

    it.each(GROUPS)('$collection: $label', ({ collection, label }) => {
        expect(auditOpenLabel(collection)).toBe(label)
    })
})
