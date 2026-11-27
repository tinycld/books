import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSendDocType, KIND_WORDS, SEND_DOC_TYPES } from '../tinycld/books/lib/send-doc-types'

// The kinds a send names and their email words, as server/testdata/send_doc_types.json
// lists them. Go TestSendDocTypes_MatchTheSharedFile reads the same file against
// sendDocTypes and documentEmailWords, so the client and the server cannot drift.
type SharedKind = { kind: string; title: string; noun: string }

const shared: SharedKind[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'send_doc_types.json'), 'utf8')
).kinds

describe('send doc types', () => {
    it('SEND_DOC_TYPES holds exactly the kinds of the shared file', () => {
        expect([...SEND_DOC_TYPES].sort()).toEqual(shared.map(k => k.kind).sort())
    })

    it('KIND_WORDS holds the title and noun of each kind of the shared file', () => {
        const words: Record<string, { title: string; noun: string }> = KIND_WORDS
        expect(Object.keys(words).sort()).toEqual(shared.map(k => k.kind).sort())
        for (const k of shared) {
            expect(words[k.kind], k.kind).toEqual({ title: k.title, noun: k.noun })
        }
    })

    it('isSendDocType takes each kind of the shared file and refuses a bill', () => {
        for (const k of shared) expect(isSendDocType(k.kind), k.kind).toBe(true)
        expect(isSendDocType('bill')).toBe(false)
    })
})
