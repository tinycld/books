// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { postAndNewHref } from '../tinycld/books/hooks/useDocumentSave'
import { documentHref, documentNewHref } from '../tinycld/books/lib/document-routes'
import { INVOICE_KIND } from '../tinycld/books/lib/sales-document-kinds'

// A kind with another route base: the routes must come from the kind, not a constant.
const OTHER_KIND = { ...INVOICE_KIND, routeBase: 'books/x' }

// The invoice routes without the org prefix (spec §2, §3.5; plan Decisions "Back link and
// navigation"): `fresh` comes first, then `customer` only when the form was opened with it.
describe('documentNewHref', () => {
    it('is the bare new route with no params', () => {
        expect(documentNewHref(INVOICE_KIND, {})).toBe('books/invoices/new')
    })

    it('puts the fresh nonce first and keeps the customer after it', () => {
        expect(documentNewHref(INVOICE_KIND, { customer: 'c1', fresh: 'f1' })).toBe(
            'books/invoices/new?fresh=f1&customer=c1'
        )
    })

    it('has no customer param when none is given', () => {
        const href = documentNewHref(INVOICE_KIND, { fresh: 'f1' })
        expect(href).toBe('books/invoices/new?fresh=f1')
        expect(href).not.toContain('customer')
    })

    it('starts a copy from ?copy', () => {
        expect(documentNewHref(INVOICE_KIND, { copy: 'i1' })).toBe('books/invoices/new?copy=i1')
    })

    it('starts a correction from ?replaces', () => {
        expect(documentNewHref(INVOICE_KIND, { replaces: 'i1' })).toBe(
            'books/invoices/new?replaces=i1'
        )
    })

    it("takes the route from the kind's routeBase", () => {
        expect(documentNewHref(OTHER_KIND, { customer: 'c1', fresh: 'f1' })).toBe(
            'books/x/new?fresh=f1&customer=c1'
        )
        expect(documentNewHref(OTHER_KIND, {})).toBe('books/x/new')
    })
})

describe('documentHref', () => {
    it("is the invoice's own route", () => {
        expect(documentHref(INVOICE_KIND, 'i1')).toBe('books/invoices/i1')
    })

    it('opens a tab with ?tab', () => {
        expect(documentHref(INVOICE_KIND, 'abc', 'pdf')).toBe('books/invoices/abc?tab=pdf')
    })

    it("takes the route from the kind's routeBase", () => {
        expect(documentHref(OTHER_KIND, 'abc', 'pdf')).toBe('books/x/abc?tab=pdf')
        expect(documentHref(OTHER_KIND, 'abc')).toBe('books/x/abc')
    })
})

describe('postAndNewHref', () => {
    it('keeps the customer when the form was opened with one, after a fresh nonce', () => {
        expect(postAndNewHref(INVOICE_KIND, 'c1')).toMatch(
            /^books\/invoices\/new\?fresh=[^&]+&customer=c1$/
        )
    })

    it('has no customer when the form was not opened with one', () => {
        const href = postAndNewHref(INVOICE_KIND, undefined)
        expect(href).toMatch(/^books\/invoices\/new\?fresh=[^&]+$/)
        expect(href).not.toContain('customer')
    })

    it('makes a new nonce each time, so a replace from new to new mounts a fresh form', () => {
        const fresh = (href: string) => new URLSearchParams(href.split('?')[1]).get('fresh')
        const first = fresh(postAndNewHref(INVOICE_KIND, undefined))
        const second = fresh(postAndNewHref(INVOICE_KIND, undefined))
        expect(first).toBeTruthy()
        expect(second).toBeTruthy()
        expect(first).not.toBe(second)
    })

    it("takes the route from the kind's routeBase", () => {
        expect(postAndNewHref(OTHER_KIND, 'c1')).toMatch(/^books\/x\/new\?fresh=[^&]+&customer=c1$/)
    })
})
