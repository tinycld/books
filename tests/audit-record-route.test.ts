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
    REFUND_RECEIPT_KIND,
    SALES_RECEIPT_KIND,
    VENDOR_CREDIT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

const ID = 'bkrecord0000001'

// An attachment's live row: on a bill, on an expense, or on a vendor credit.
const ON_BILL = { id: ID, bill: 'bkbill00001001', expense: '', vendor_credit: '' }
const ON_EXPENSE = { id: ID, bill: '', expense: 'bkexpense001001', vendor_credit: '' }
const ON_VENDOR_CREDIT = { id: ID, bill: '', expense: '', vendor_credit: 'vcrd1001pacpw01' }

const DOCUMENTS = [
    { collection: 'books_invoices', kind: INVOICE_KIND, path: 'books/invoices' },
    { collection: 'books_sales_receipts', kind: SALES_RECEIPT_KIND, path: 'books/sales-receipts' },
    { collection: 'books_credit_memos', kind: CREDIT_MEMO_KIND, path: 'books/credit-memos' },
    {
        collection: 'books_refund_receipts',
        kind: REFUND_RECEIPT_KIND,
        path: 'books/refund-receipts',
    },
    { collection: 'books_estimates', kind: ESTIMATE_KIND, path: 'books/estimates' },
    { collection: 'books_bills', kind: BILL_KIND, path: 'books/bills' },
    { collection: 'books_expenses', kind: EXPENSE_KIND, path: 'books/expenses' },
    { collection: 'books_vendor_credits', kind: VENDOR_CREDIT_KIND, path: 'books/vendor-credits' },
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
    // Write-off spec §3.6: a write-off's history opens its page.
    { collection: 'books_write_offs', path: `books/write-offs/${ID}` },
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
    { collection: 'books_bank_matches', path: 'books/banking', label: 'Open banking' },
    // Bank-categorize spec §4: a categorization's history opens Banking, as a match's.
    { collection: 'books_bank_categorizations', path: 'books/banking', label: 'Open banking' },
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

    // Refund receipt spec §3.13: a refund receipt line's audit rows are filed under its
    // refund (parent_type books_refund_receipts, parent_id the refund id: the audit view's
    // LINES), so the history of a line is the refund's, and its Open is the refund's read
    // view; a refund's entry opens on its refund, and its void reversal as an entry.
    it('a refund receipt record, the refund id a line’s history is filed under, and its entry open books/refund-receipts/<id>', () => {
        const refund = 'rfrp1001every01'
        // A line reaches the client already filed under its parent (the server's audit view files it; Go tests cover that), so the record call is the line's too, not coverage of a client line route.
        expect(auditRecordHref('books_refund_receipts', refund, { id: refund })).toBe(
            `books/refund-receipts/${refund}`
        )
        expect(auditOpenLabel('books_refund_receipts')).toBe('Open refund receipt')
        const posted = {
            id: ID,
            doc_type: 'refund_receipt',
            origin: 'document',
            document: refund,
        } as const
        expect(auditRecordHref('books_journal_entries', ID, posted)).toBe(
            `books/refund-receipts/${refund}`
        )
        const reversal = { ...posted, origin: 'void_reversal', document: '' } as const
        expect(auditRecordHref('books_journal_entries', ID, reversal)).toBe(`books/entries/${ID}`)
    })

    // A vendor credit's lines and applications are filed under their credit (parent_type
    // books_vendor_credits, parent_id the credit id: migration 2100000024's LINES), so the
    // history of a line or an application is the credit's, and its Open is the credit's
    // read view.
    it('a vendor credit record, and the credit id a line’s or an application’s history is filed under, open books/vendor-credits/<id>', () => {
        const credit = 'vcrd1002ironc01'
        expect(auditRecordHref('books_vendor_credits', credit, { id: credit })).toBe(
            `books/vendor-credits/${credit}`
        )
        expect(auditOpenLabel('books_vendor_credits')).toBe('Open vendor credit')
    })

    // Apply credit spec §3.8: a credit memo application's history opens its credit memo's
    // read view, from the application's live row, never the invoice's.
    it('a credit memo application opens its credit memo’s read view', () => {
        const memo = 'crmo1001foxhv01'
        const live = { id: ID, credit_memo: memo, invoice: 'invc1001foxhv01' }
        expect(auditRecordHref('books_credit_memo_applications', ID, live)).toBe(
            documentHref(CREDIT_MEMO_KIND, memo)
        )
        expect(auditRecordHref('books_credit_memo_applications', ID, live)).toBe(
            `books/credit-memos/${memo}`
        )
        expect(auditRecordOpenLabel('books_credit_memo_applications', live)).toBe(
            'Open credit memo'
        )
        expect(auditRecordHref('books_credit_memo_applications', ID, undefined)).toBeNull()
    })

    // Vendor refund spec §3.11: a vendor refund's lines are filed under their refund
    // (parent_type books_vendor_refunds, parent_id the refund id: migration 2100000038's
    // LINES), so the history of a line is the refund's, and its Open is the refund's read
    // view; a refund's entry opens on its refund, and its void reversal as an entry.
    it('a vendor refund record, the refund id a line’s history is filed under, and its entry open books/vendor-refunds/<id>', () => {
        const refund = 'vrfd1001cascf01'
        expect(auditRecordHref('books_vendor_refunds', refund, { id: refund })).toBe(
            `books/vendor-refunds/${refund}`
        )
        expect(auditOpenLabel('books_vendor_refunds')).toBe('Open vendor refund')
        const posted = {
            id: ID,
            doc_type: 'vendor_refund',
            origin: 'document',
            document: refund,
        } as const
        expect(auditRecordHref('books_journal_entries', ID, posted)).toBe(
            `books/vendor-refunds/${refund}`
        )
        const reversal = { ...posted, origin: 'void_reversal', document: '' } as const
        expect(auditRecordHref('books_journal_entries', ID, reversal)).toBe(`books/entries/${ID}`)
    })

    // Bank deposit spec §3.7: a deposit's history opens the deposit; an item's or an other
    // funds line's history opens its deposit, from the row's live deposit; a deposit's
    // entry opens on its deposit, and its void reversal as an entry.
    it('a deposit record, an item or line of it, and its entry open books/deposits/<id>', () => {
        const deposit = 'dpst1001frida01'
        expect(auditRecordHref('books_deposits', deposit, { id: deposit })).toBe(
            `books/deposits/${deposit}`
        )
        expect(auditOpenLabel('books_deposits')).toBe('Open deposit')
        for (const collection of ['books_deposit_items', 'books_deposit_lines']) {
            const live = { id: ID, deposit }
            expect(auditRecordHref(collection, ID, live), collection).toBe(
                `books/deposits/${deposit}`
            )
            expect(auditRecordOpenLabel(collection, live), collection).toBe('Open deposit')
            expect(auditRecordHref(collection, ID, undefined), collection).toBeNull()
        }
        const posted = {
            id: ID,
            doc_type: 'deposit',
            origin: 'document',
            document: deposit,
        } as const
        expect(auditRecordHref('books_journal_entries', ID, posted)).toBe(
            `books/deposits/${deposit}`
        )
        const reversal = { ...posted, origin: 'void_reversal', document: '' } as const
        expect(auditRecordHref('books_journal_entries', ID, reversal)).toBe(`books/entries/${ID}`)
    })

    // Email-share plan decision 2: a sent email's history is filed under its document, so
    // its Open is that document's read view, from the send's doc_type and document.
    it('a sent email opens the invoice or estimate it sent, and nothing without one', () => {
        const invoice = 'invc1001harbr01'
        const estimate = 'estm1001harbr01'
        const invoiceSend = { id: ID, doc_type: 'invoice', document: invoice }
        expect(auditRecordHref('books_document_sends', ID, invoiceSend)).toBe(
            `books/invoices/${invoice}`
        )
        expect(
            auditRecordHref('books_document_sends', ID, {
                id: ID,
                doc_type: 'estimate',
                document: estimate,
            })
        ).toBe(`books/estimates/${estimate}`)
        expect(
            auditRecordHref('books_document_sends', ID, {
                id: ID,
                doc_type: 'invoice',
                document: '',
            })
        ).toBeNull()
        expect(
            auditRecordHref('books_document_sends', ID, {
                id: ID,
                doc_type: 'bill',
                document: invoice,
            })
        ).toBeNull()
        expect(auditRecordOpenLabel('books_document_sends', invoiceSend)).toBe('Open invoice')
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

    // Write-off spec §3.6: a write-off's entry opens on its write-off, and its void
    // reversal as an entry.
    it('opens a write-off’s entry on its write-off, and its void reversal as an entry', () => {
        const posted = {
            id: ID,
            doc_type: 'write_off',
            origin: 'document',
            document: 'wofx1001delta01',
        } as const
        expect(auditRecordHref('books_journal_entries', ID, posted)).toBe(
            'books/write-offs/wofx1001delta01'
        )
        expect(auditOpenLabel('books_write_offs')).toBe('Open write-off')
        const reversal = { ...posted, origin: 'void_reversal', document: '' } as const
        expect(auditRecordHref('books_journal_entries', ID, reversal)).toBe(`books/entries/${ID}`)
    })

    it('opens an attachment’s bill, expense or vendor credit', () => {
        expect(auditRecordHref('books_attachments', ID, ON_BILL)).toBe('books/bills/bkbill00001001')
        expect(auditRecordHref('books_attachments', ID, ON_EXPENSE)).toBe(
            'books/expenses/bkexpense001001'
        )
        expect(auditRecordHref('books_attachments', ID, ON_VENDOR_CREDIT)).toBe(
            'books/vendor-credits/vcrd1001pacpw01'
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
        expect(auditRecordOpenLabel('books_attachments', ON_VENDOR_CREDIT)).toBe(
            'Open vendor credit'
        )
    })

    it('names any other record by its own type', () => {
        expect(auditRecordOpenLabel('books_invoices', { id: ID })).toBe('Open invoice')
    })
})
