import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { documentSendSchema, parseCc, sendOffered } from '../tinycld/books/lib/document-send'

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

describe('parseCc', () => {
    it('splits on commas and trims each address', () => {
        expect(parseCc(' a@b.example , c@d.example ')).toEqual(['a@b.example', 'c@d.example'])
    })

    it('gives no address for an empty field', () => {
        expect(parseCc('')).toEqual([])
    })
})
