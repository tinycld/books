import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DocumentListRow } from '../tinycld/books/lib/document-list'
import {
    batchResultLines,
    batchSendCopy,
    batchSendCounts,
    batchSendOffered,
    batchSentToast,
    documentSendSchema,
    documentSentLine,
    parseCc,
    sendDialogStatus,
    sendOffered,
    sentToast,
} from '../tinycld/books/lib/document-send'
import type { TransactionKind } from '../tinycld/books/lib/party-transactions'

// The send rules TypeScript and Go both hold (spec §3.1, §3.2), against the
// case table the Go route test also runs.
type OfferCase = { name: string; kind: string; status: string; offered: boolean; message: string }
type FieldCase = {
    name: string
    to: string
    cc: string[]
    subject: string
    bodyText: string
    bodyHtmlLength: number
    field: string
    clientMessage: string
    serverMessage: string
}

const CASES: { offer: OfferCase[]; fields: FieldCase[] } = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'document_send_cases.json'), 'utf8')
)

// The case's message: one paragraph of its text, padded with "a" to
// bodyHtmlLength characters of HTML when that is set (the Go test's rule).
function caseBody(c: FieldCase) {
    const pad =
        c.bodyHtmlLength > 0
            ? 'a'.repeat(c.bodyHtmlLength - '<p></p>'.length - c.bodyText.length)
            : ''
    const text = c.bodyText + pad
    return { body: `<p>${text}</p>`, bodyText: text }
}

describe('sendOffered', () => {
    it.each(CASES.offer.map(c => [c.name, c] as const))('%s', (_name, c) => {
        expect(sendOffered(c.kind, c.status)).toBe(c.offered)
    })
})

describe('documentSendSchema', () => {
    it.each(CASES.fields.map(c => [c.name, c] as const))('%s', (_name, c) => {
        const result = documentSendSchema.safeParse({
            to: c.to,
            cc: c.cc.join(', '),
            subject: c.subject,
            ...caseBody(c),
        })
        if (c.field === '') {
            expect(result.error?.issues ?? []).toEqual([])
            expect(result.success).toBe(true)
            return
        }
        const issues = (result.error?.issues ?? []).map(issue => ({
            path: issue.path,
            message: issue.message,
        }))
        expect(issues).toEqual([{ path: [c.field], message: c.clientMessage }])
    })
})

// The sent line under a document's status (spec §3.6): the latest send's day and address,
// and after more than one send the count. The send is at local noon of Nov 20, written as the
// UTC datetime PocketBase stores, so its reader's day is Nov 20 in every zone, UTC-12 to UTC+14.
describe('documentSentLine', () => {
    const created = new Date(2026, 10, 20, 12, 0, 0).toISOString().replace('T', ' ')
    const latest = { created, to: 'billing@cedarhollow.example' }

    it('names the day and the address of one send', () => {
        expect(documentSentLine(latest, 1)).toBe('Sent Nov 20, 2026 to billing@cedarhollow.example')
    })

    it('adds the count after more than one send', () => {
        expect(documentSentLine(latest, 3)).toBe(
            'Sent Nov 20, 2026 to billing@cedarhollow.example · sent 3 times'
        )
        expect(documentSentLine(latest, 3).endsWith(' · sent 3 times')).toBe(true)
    })
})

// The toast of a single send (spec §3.2 "On success").
describe('sentToast', () => {
    it('names the kind, the number and the address', () => {
        expect(sentToast('Invoice', '1004', 'a@b.example')).toBe('Invoice 1004 sent to a@b.example')
        expect(sentToast('Sales receipt', '2001', 'a@b.example')).toBe(
            'Sales receipt 2001 sent to a@b.example'
        )
    })
})

// The Send dialog's state from its three reads (the document, its customer, the settings
// row; each a live query's flags) and the email status (plan decision 21). A failed read
// wins over a pending one; the email status counts only once the three have landed, and a
// status that is loading or failed counts as "cannot send".
describe('sendDialogStatus', () => {
    const LANDED = { isLoading: false, isError: false }
    const PENDING = { isLoading: true, isError: false }
    const FAILED = { isLoading: false, isError: true }
    const CAN_SEND = { canSend: true, isLoading: false }

    it("gives 'failed' for one failed read, also when another is pending", () => {
        expect(sendDialogStatus({ reads: [FAILED, LANDED, LANDED], email: CAN_SEND })).toBe(
            'failed'
        )
        expect(sendDialogStatus({ reads: [LANDED, PENDING, FAILED], email: CAN_SEND })).toBe(
            'failed'
        )
        expect(
            sendDialogStatus({
                reads: [PENDING, FAILED, LANDED],
                email: { canSend: false, isLoading: true },
            })
        ).toBe('failed')
    })

    it("gives 'loading' for one pending read with none failed", () => {
        expect(sendDialogStatus({ reads: [LANDED, LANDED, PENDING], email: CAN_SEND })).toBe(
            'loading'
        )
        expect(
            sendDialogStatus({
                reads: [PENDING, LANDED, LANDED],
                email: { canSend: false, isLoading: false },
            })
        ).toBe('loading')
    })

    it("gives 'not-set-up' for three landed reads with the email status loading, failed or unable to send", () => {
        const reads = [LANDED, LANDED, LANDED]
        expect(sendDialogStatus({ reads, email: { canSend: false, isLoading: true } })).toBe(
            'not-set-up'
        )
        // A failed status read: useEmailStatus answers canSend false once it settles.
        expect(sendDialogStatus({ reads, email: { canSend: false, isLoading: false } })).toBe(
            'not-set-up'
        )
    })

    it("gives 'ready' for three landed reads when the server can send", () => {
        expect(sendDialogStatus({ reads: [LANDED, LANDED, LANDED], email: CAN_SEND })).toBe('ready')
    })
})

// A sales list row (lib/document-list.ts) of a kind and a stored status; `email` is the
// document's own address (plan decision 7), '' for none.
let nextId = 0
function listRow(
    kind: TransactionKind,
    recordStatus: string,
    fields: Partial<DocumentListRow> = {}
): DocumentListRow {
    nextId += 1
    return {
        id: `doc${String(nextId).padStart(12, '0')}`,
        key: String(1000 + nextId),
        kind,
        number: String(1000 + nextId),
        date: '2026-11-17',
        dueDate: '',
        total: 150,
        currency: 'USD',
        created: '2026-11-17 10:00:00.000Z',
        status: { label: 'Open', tone: 'warning' },
        sequence: 1000 + nextId,
        partyId: 'cus000000000001',
        partyName: 'Acme',
        memo: '',
        reference: '',
        expires: '',
        balance: 0,
        entry: '',
        convertedInvoice: '',
        recordStatus,
        category: { kind: 'none' },
        email: 'billing@acme.example',
        ...fields,
    }
}

const WRITER = true
const READER = false

// Spec §3.3 "Batch": the Batch actions menu offers Send for a writer when at least one
// ticked row is sent-able by kind and status (plan decision 6).
describe('batchSendOffered', () => {
    const notSentable = [
        listRow('invoice', 'draft'),
        listRow('invoice', 'void'),
        listRow('sales_receipt', 'void'),
        listRow('estimate', 'closed'),
        listRow('payment', 'posted', { email: '' }),
        listRow('credit_memo', 'draft'),
    ]

    it('is false for a reader, also with a posted invoice ticked', () => {
        expect(batchSendOffered([listRow('invoice', 'posted')], READER)).toBe(false)
    })

    it('is false for only drafts, void rows, closed estimates and payment rows', () => {
        expect(batchSendOffered(notSentable, WRITER)).toBe(false)
        expect(batchSendOffered([listRow('invoice', 'draft')], WRITER)).toBe(false)
        expect(batchSendOffered([listRow('payment', 'posted')], WRITER)).toBe(false)
        expect(batchSendOffered([], WRITER)).toBe(false)
    })

    it('is true with one posted invoice among them', () => {
        expect(batchSendOffered([...notSentable, listRow('invoice', 'posted')], WRITER)).toBe(true)
    })

    it('is true for a sent-able row with no address (the dialog skips it)', () => {
        expect(batchSendOffered([listRow('invoice', 'posted', { email: '' })], WRITER)).toBe(true)
    })
})

// The counts the batch dialog reads: a row is sendable when sent-able and with an address,
// "no email address" when sent-able with none, "a draft or void" when not sent-able.
describe('batchSendCounts', () => {
    it('counts every kind and status, with and without an address', () => {
        const rows = [
            // sendable
            listRow('invoice', 'posted'),
            listRow('estimate', 'pending'),
            listRow('estimate', 'accepted'),
            listRow('estimate', 'rejected'),
            listRow('sales_receipt', 'posted'),
            listRow('credit_memo', 'posted'),
            listRow('refund_receipt', 'posted'),
            // no address
            listRow('invoice', 'posted', { email: '' }),
            listRow('estimate', 'pending', { email: '' }),
            listRow('refund_receipt', 'posted', { email: '' }),
            // not sendable, with or without an address
            listRow('invoice', 'draft'),
            listRow('invoice', 'void', { email: '' }),
            listRow('estimate', 'closed'),
            listRow('sales_receipt', 'draft', { email: '' }),
            listRow('credit_memo', 'void'),
            listRow('refund_receipt', 'void'),
            listRow('payment', 'posted', { email: '' }),
            listRow('write_off', 'posted', { email: '' }),
        ]
        expect(batchSendCounts(rows)).toEqual({
            sendable: 7,
            noAddress: 3,
            notSendable: 8,
            closed: 0,
        })
    })

    it('counts no row for an empty selection', () => {
        expect(batchSendCounts([])).toEqual({
            sendable: 0,
            noAddress: 0,
            notSendable: 0,
            closed: 0,
        })
    })

    it('a draft with no address counts as not sendable, not as no address', () => {
        expect(batchSendCounts([listRow('invoice', 'draft', { email: '' })])).toEqual({
            sendable: 0,
            noAddress: 0,
            notSendable: 1,
            closed: 0,
        })
    })

    // Purchase order spec §3.1: an order is open or closed, never a draft or void, so a
    // closed order counts as closed, with or without an address; a closed estimate does not.
    it('a closed purchase order counts as closed, not as not sendable', () => {
        const order = { kind: 'purchase_order' } as const
        const rows = [
            listRow('estimate', 'open', order),
            listRow('estimate', 'closed', order),
            listRow('estimate', 'closed', { ...order, email: '' }),
            listRow('estimate', 'closed'),
            listRow('invoice', 'draft'),
        ]
        expect(batchSendCounts(rows)).toEqual({
            sendable: 1,
            noAddress: 0,
            notSendable: 2,
            closed: 2,
        })
    })
})

// The batch dialog's texts (spec §3.3 "Batch"; plan decision 6): its title, its lead line,
// the skipped line (null when none is skipped), the refusal (null when none), the confirm's
// label (null when the dialog has only Close) and whether the confirm is enabled.
describe('batchSendCopy', () => {
    it('12 ticked, 9 sendable: the title, the body, the skipped line and "Send 9", enabled', () => {
        expect(
            batchSendCopy({ sendable: 9, noAddress: 2, notSendable: 1, closed: 0 }, true)
        ).toEqual({
            title: 'Send 12 documents?',
            body: 'Each goes to the email address on the document.',
            skipped: '3 are skipped: 2 have no email address, 1 is a draft or void.',
            refusal: null,
            confirmLabel: 'Send 9',
            isConfirmEnabled: true,
        })
    })

    it('one skipped row with no address: the singular skipped line', () => {
        expect(
            batchSendCopy({ sendable: 2, noAddress: 1, notSendable: 0, closed: 0 }, true).skipped
        ).toBe('1 is skipped: 1 has no email address.')
    })

    it('one document: "Send 1 document?" and "Send 1", with no skipped line', () => {
        expect(
            batchSendCopy({ sendable: 1, noAddress: 0, notSendable: 0, closed: 0 }, true)
        ).toEqual({
            title: 'Send 1 document?',
            body: 'Each goes to the email address on the document.',
            skipped: null,
            refusal: null,
            confirmLabel: 'Send 1',
            isConfirmEnabled: true,
        })
    })

    it('no skipped row: no skipped line', () => {
        expect(
            batchSendCopy({ sendable: 4, noAddress: 0, notSendable: 0, closed: 0 }, true).skipped
        ).toBeNull()
    })

    it('no sendable row: "Send 0", disabled', () => {
        const copy = batchSendCopy({ sendable: 0, noAddress: 2, notSendable: 1, closed: 0 }, true)
        expect(copy.confirmLabel).toBe('Send 0')
        expect(copy.isConfirmEnabled).toBe(false)
        expect(copy.skipped).toBe('3 are skipped: 2 have no email address, 1 is a draft or void.')
    })

    // Purchase order spec §3.1: an order has no draft and no void, so a closed one is named
    // closed; the other kinds keep "a draft or void".
    it('closed purchase orders: "1 is closed" and "2 are closed"', () => {
        expect(
            batchSendCopy({ sendable: 1, noAddress: 1, notSendable: 0, closed: 1 }, true).skipped
        ).toBe('2 are skipped: 1 has no email address, 1 is closed.')
        expect(
            batchSendCopy({ sendable: 1, noAddress: 0, notSendable: 0, closed: 2 }, true).skipped
        ).toBe('2 are skipped: 2 are closed.')
    })

    it('a closed order beside a draft bill: each named in its own words', () => {
        const copy = batchSendCopy({ sendable: 0, noAddress: 0, notSendable: 2, closed: 1 }, true)
        expect(copy.title).toBe('Send 3 documents?')
        expect(copy.skipped).toBe('3 are skipped: 2 are drafts or void, 1 is closed.')
    })

    it('201 sendable: the refusal "Select at most 200 documents." and a disabled confirm', () => {
        const copy = batchSendCopy({ sendable: 201, noAddress: 0, notSendable: 0, closed: 0 }, true)
        expect(copy.refusal).toBe('Select at most 200 documents.')
        expect(copy.isConfirmEnabled).toBe(false)
    })

    it('200 sendable: no refusal, enabled', () => {
        const copy = batchSendCopy({ sendable: 200, noAddress: 0, notSendable: 0, closed: 0 }, true)
        expect(copy.refusal).toBeNull()
        expect(copy.isConfirmEnabled).toBe(true)
    })

    it('email not set up: the body "Email sending is not set up." and Close alone', () => {
        const copy = batchSendCopy({ sendable: 9, noAddress: 2, notSendable: 1, closed: 0 }, false)
        expect(copy.body).toBe('Email sending is not set up.')
        expect(copy.confirmLabel).toBeNull()
        expect(copy.isConfirmEnabled).toBe(false)
    })
})

describe('batchSentToast', () => {
    it('counts the documents sent, plural and singular', () => {
        expect(batchSentToast(9)).toBe('9 documents sent')
        expect(batchSentToast(1)).toBe('1 document sent')
    })
})

// The banner after a part failure (spec §3.3 "Result"): the summary, then one line for each
// failed document, "<Kind word> <number>: <the server's message>", the number read from the
// ticked rows by the failed item's id.
describe('batchResultLines', () => {
    it('gives "6 of 9 documents were sent." and one line for each failed document', () => {
        const invoice = listRow('invoice', 'posted', { number: '1003' })
        const receipt = listRow('sales_receipt', 'posted', { number: '2001' })
        const memo = listRow('credit_memo', 'posted', { number: 'CM-7' })
        const refused =
            'The email server refused billing@northwind.example. Correct the address and send again.'
        const notRecorded = 'The email was sent, but the send could not be recorded.'
        expect(
            batchResultLines({
                sent: 6,
                failed: [
                    { kind: 'invoice', id: invoice.id, message: refused },
                    { kind: 'sales_receipt', id: receipt.id, message: notRecorded },
                    { kind: 'credit_memo', id: memo.id, message: refused },
                ],
                rows: [invoice, receipt, memo, listRow('invoice', 'posted')],
            })
        ).toEqual({
            summary: '6 of 9 documents were sent.',
            lines: [
                `Invoice 1003: ${refused}`,
                `Sales receipt 2001: ${notRecorded}`,
                `Credit memo CM-7: ${refused}`,
            ],
        })
    })

    it('names an estimate and a refund receipt by their kind words', () => {
        const estimate = listRow('estimate', 'pending', { number: 'E-12' })
        const refund = listRow('refund_receipt', 'posted', { number: 'R-3' })
        const result = batchResultLines({
            sent: 1,
            failed: [
                { kind: 'estimate', id: estimate.id, message: 'Document not found.' },
                { kind: 'refund_receipt', id: refund.id, message: 'Document not found.' },
            ],
            rows: [estimate, refund],
        })
        expect(result.summary).toBe('1 of 3 documents were sent.')
        expect(result.lines).toEqual([
            'Estimate E-12: Document not found.',
            'Refund receipt R-3: Document not found.',
        ])
    })
})

describe('parseCc', () => {
    it('splits on commas and trims each address', () => {
        expect(parseCc(' a@b.example , c@d.example ')).toEqual(['a@b.example', 'c@d.example'])
    })

    it('gives no address for an empty field', () => {
        expect(parseCc('')).toEqual([])
    })
})
