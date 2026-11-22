import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    documentSendSchema,
    documentSentLine,
    parseCc,
    sendDialogStatus,
    sendOffered,
    sentToast,
} from '../tinycld/books/lib/document-send'

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

describe('parseCc', () => {
    it('splits on commas and trims each address', () => {
        expect(parseCc(' a@b.example , c@d.example ')).toEqual(['a@b.example', 'c@d.example'])
    })

    it('gives no address for an empty field', () => {
        expect(parseCc('')).toEqual([])
    })
})
