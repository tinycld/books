// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { postAndNewHref } from '../tinycld/books/hooks/useInvoiceSave'
import { invoiceHref, invoiceNewHref } from '../tinycld/books/lib/invoice-routes'

// The invoice routes without the org prefix (spec §2, §3.5; plan Decisions "Back link and
// navigation"): `fresh` comes first, then `customer` only when the form was opened with it.
describe('invoiceNewHref', () => {
    it('is the bare new route with no params', () => {
        expect(invoiceNewHref({})).toBe('books/invoices/new')
    })

    it('puts the fresh nonce first and keeps the customer after it', () => {
        expect(invoiceNewHref({ customer: 'c1', fresh: 'f1' })).toBe(
            'books/invoices/new?fresh=f1&customer=c1'
        )
    })

    it('has no customer param when none is given', () => {
        const href = invoiceNewHref({ fresh: 'f1' })
        expect(href).toBe('books/invoices/new?fresh=f1')
        expect(href).not.toContain('customer')
    })

    it('starts a copy from ?copy', () => {
        expect(invoiceNewHref({ copy: 'i1' })).toBe('books/invoices/new?copy=i1')
    })

    it('starts a correction from ?replaces', () => {
        expect(invoiceNewHref({ replaces: 'i1' })).toBe('books/invoices/new?replaces=i1')
    })
})

describe('invoiceHref', () => {
    it("is the invoice's own route", () => {
        expect(invoiceHref('i1')).toBe('books/invoices/i1')
    })
})

describe('postAndNewHref', () => {
    it('keeps the customer when the form was opened with one, after a fresh nonce', () => {
        expect(postAndNewHref('c1')).toMatch(/^books\/invoices\/new\?fresh=[^&]+&customer=c1$/)
    })

    it('has no customer when the form was not opened with one', () => {
        const href = postAndNewHref(undefined)
        expect(href).toMatch(/^books\/invoices\/new\?fresh=[^&]+$/)
        expect(href).not.toContain('customer')
    })

    it('makes a new nonce each time, so a replace from new to new mounts a fresh form', () => {
        const fresh = (href: string) => new URLSearchParams(href.split('?')[1]).get('fresh')
        const first = fresh(postAndNewHref(undefined))
        const second = fresh(postAndNewHref(undefined))
        expect(first).toBeTruthy()
        expect(second).toBeTruthy()
        expect(first).not.toBe(second)
    })
})
