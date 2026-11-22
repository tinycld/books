import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    type DocumentEmailInput,
    documentEmail,
    documentEmailInputOf,
} from '../tinycld/books/lib/document-email'
import { documentLinkUrl } from '../tinycld/books/lib/document-link'

// The starting subject and message of a document email (spec §3.3), against
// the vector file the Go documentEmail also reads, so the two cannot drift.
type DocumentEmailCase = {
    name: string
    input: DocumentEmailInput
    subject: string
    bodyHtml: string
}

const CASES: DocumentEmailCase[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'document_email_cases.json'), 'utf8')
)

describe('documentEmail', () => {
    it('has a case for each kind', () => {
        const kinds = new Set(CASES.map(c => c.input.kind))
        expect([...kinds].sort()).toEqual([
            'credit_memo',
            'estimate',
            'invoice',
            'refund_receipt',
            'sales_receipt',
        ])
    })

    it.each(CASES.map(c => [c.name, c] as const))('%s', (_name, c) => {
        expect(documentEmail(c.input)).toEqual({ subject: c.subject, bodyHtml: c.bodyHtml })
    })
})

// A posted invoice as its row is stored, the shape Go documentEmailInputOf reads.
function storedInvoice(record: { message: string; currency: string }) {
    return {
        kind: 'invoice' as const,
        record: {
            number: '1004',
            date: '2026-10-21',
            due_date: '2026-11-20',
            total: 211177,
            balance: 211177,
            public_token: 'tok1004',
            ...record,
        },
        customerName: 'Harborview Hospitality Group',
        settings: { business_name: 'Hartwell Supply Co.', phone: '', currency: 'USD' },
        organizationName: 'Hartwell',
        today: '2026-11-22',
        address: 'https://books.example',
    }
}

describe('documentEmailInputOf', () => {
    it('trims the outer whitespace of the stored message, as Go does', () => {
        const input = documentEmailInputOf(
            storedInvoice({ message: '  Thank you.\n', currency: 'USD' })
        )
        expect(input.message).toBe('Thank you.')
    })

    it('gives an empty message, and no message block, for a message of only spaces', () => {
        const input = documentEmailInputOf(storedInvoice({ message: '   ', currency: 'USD' }))
        expect(input.message).toBe('')
        expect(documentEmail(input).bodyHtml).toBe(
            '<p>Hello Harborview Hospitality Group,</p>' +
                '<p>Attached is invoice 1004 from Hartwell Supply Co.</p>' +
                '<p>Invoice date: Oct 21, 2026<br>Due date: Nov 20, 2026<br>Total: $2,111.77<br>' +
                '<strong>Balance due: $2,111.77</strong></p>' +
                '<p>View this invoice online:<br>' +
                '<a href="https://books.example/p/books/invoices/tok1004">' +
                'https://books.example/p/books/invoices/tok1004</a></p>' +
                '<p>To pay, or to ask about this invoice, reply to this email.</p>'
        )
    })

    it('formats money in the settings currency when the document has none', () => {
        const input = documentEmailInputOf(storedInvoice({ message: '', currency: '' }))
        expect(input.total).toBe('$2,111.77')
        expect(input.balance).toBe('$2,111.77')
    })
})

describe('documentLinkUrl', () => {
    it('puts an invoice token under /p/books/invoices with no doubled slash', () => {
        expect(documentLinkUrl('invoice', 'tok123', 'https://x.example/')).toBe(
            'https://x.example/p/books/invoices/tok123'
        )
    })
})
