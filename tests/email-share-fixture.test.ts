import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    type DocumentSendRecord,
    INVOICE_TOKENS,
    type InvoicePublicRow,
} from '../tinycld/books/lib/email-share-fixture'
import type { BooksDocumentSends, BooksInvoicePublic } from '../tinycld/books/types'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

describe('generated email-share types', () => {
    it('the fixture row types are the generated types', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<DocumentSendRecord>().toEqualTypeOf<BooksDocumentSends>()
        expectTypeOf<InvoicePublicRow>().toEqualTypeOf<BooksInvoicePublic>()
    })
})

describe('INVOICE_TOKENS', () => {
    it('every token is 43 URL-safe characters, and no two are equal', () => {
        const tokens: string[] = Object.values(INVOICE_TOKENS)
        expect(tokens.length).toBeGreaterThan(0)
        expect(tokens.filter(token => !TOKEN_PATTERN.test(token))).toEqual([])
        expect(new Set(tokens).size).toBe(tokens.length)
    })
})
