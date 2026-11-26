// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { postAndNewHref } from '../tinycld/books/hooks/useDocumentSave'
import { documentHref, documentNewHref, documentPath } from '../tinycld/books/lib/document-routes'
import {
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    INVOICE_KIND,
    REFUND_RECEIPT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

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

    // Convert to invoice (spec §3.7) opens the invoice form started from the estimate.
    it('starts an invoice from an estimate with ?estimate', () => {
        expect(documentNewHref(INVOICE_KIND, { estimate: 'e1' })).toBe(
            'books/invoices/new?estimate=e1'
        )
    })

    // A vendor kind (checkpoint 2): the opened-with param is the party's field, after
    // `fresh`; Post & new from a form not opened with a vendor has none.
    it('keeps the vendor after the fresh nonce, and has none when not given', () => {
        expect(documentNewHref({ routeBase: 'books/bills' }, { vendor: 'v1', fresh: 'f1' })).toBe(
            'books/bills/new?fresh=f1&vendor=v1'
        )
        expect(documentNewHref({ routeBase: 'books/bills' }, { fresh: 'f1' })).toBe(
            'books/bills/new?fresh=f1'
        )
    })

    // Save & new on an estimate carries the customer it was opened with; no screen of
    // this unit links to `?customer`, so this is its coverage. The layer's order holds:
    // `fresh` first, then `customer`.
    it('starts a new estimate with its customer under books/estimates', () => {
        expect(documentNewHref(ESTIMATE_KIND, { customer: 'c1', fresh: 'f1' })).toBe(
            'books/estimates/new?fresh=f1&customer=c1'
        )
    })
})

describe('documentPath', () => {
    it("is the invoice's own route", () => {
        expect(documentPath(INVOICE_KIND, 'i1')).toBe('books/invoices/i1')
    })

    it('opens a tab with ?tab', () => {
        expect(documentPath(INVOICE_KIND, 'abc', 'pdf')).toBe('books/invoices/abc?tab=pdf')
    })

    it("takes the route from the kind's routeBase", () => {
        expect(documentPath(OTHER_KIND, 'abc', 'pdf')).toBe('books/x/abc?tab=pdf')
        expect(documentPath(OTHER_KIND, 'abc')).toBe('books/x/abc')
    })
})

describe('documentHref', () => {
    it('opens a numbered document by its sequence', () => {
        expect(documentHref(INVOICE_KIND, { id: 'i1', sequence: 1005, replaced_by: '' })).toBe(
            'books/invoices/1005'
        )
        expect(documentHref(INVOICE_KIND, { id: 'i1', sequence: 1005 }, 'pdf')).toBe(
            'books/invoices/1005?tab=pdf'
        )
    })

    it('opens a draft and a replaced document by its id', () => {
        expect(documentHref(INVOICE_KIND, { id: 'i1', sequence: 0, replaced_by: '' })).toBe(
            'books/invoices/i1'
        )
        expect(documentHref(INVOICE_KIND, { id: 'i1', sequence: 1005, replaced_by: 'i2' })).toBe(
            'books/invoices/i1'
        )
        expect(documentHref(INVOICE_KIND, { id: 'i1' })).toBe('books/invoices/i1')
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

// The credit memo's routes (spec §2): the two pushed pages under books/credit-memos.
describe('the credit memo routes', () => {
    it('opens a new memo, a copy, a correction and a memo for a customer', () => {
        expect(documentNewHref(CREDIT_MEMO_KIND, {})).toBe('books/credit-memos/new')
        expect(documentNewHref(CREDIT_MEMO_KIND, { customer: 'c1' })).toBe(
            'books/credit-memos/new?customer=c1'
        )
        expect(documentNewHref(CREDIT_MEMO_KIND, { copy: 'm1' })).toBe(
            'books/credit-memos/new?copy=m1'
        )
        expect(documentNewHref(CREDIT_MEMO_KIND, { replaces: 'm1' })).toBe(
            'books/credit-memos/new?replaces=m1'
        )
    })

    it('opens a memo and its PDF tab', () => {
        expect(documentPath(CREDIT_MEMO_KIND, 'm1')).toBe('books/credit-memos/m1')
        expect(documentPath(CREDIT_MEMO_KIND, 'm1', 'pdf')).toBe('books/credit-memos/m1?tab=pdf')
    })

    it('Post & new starts a fresh memo, with the customer only when the form had one', () => {
        expect(postAndNewHref(CREDIT_MEMO_KIND, undefined)).toMatch(
            /^books\/credit-memos\/new\?fresh=[^&]+$/
        )
        expect(postAndNewHref(CREDIT_MEMO_KIND, 'c1')).toMatch(
            /^books\/credit-memos\/new\?fresh=[^&]+&customer=c1$/
        )
    })
})

// The refund receipt's routes (spec §2, §3.7): the two pushed pages under
// books/refund-receipts.
describe('the refund receipt routes', () => {
    it('opens a new refund, a copy, a correction and a refund for a customer', () => {
        expect(documentNewHref(REFUND_RECEIPT_KIND, {})).toBe('books/refund-receipts/new')
        expect(documentNewHref(REFUND_RECEIPT_KIND, { customer: 'c1' })).toBe(
            'books/refund-receipts/new?customer=c1'
        )
        expect(documentNewHref(REFUND_RECEIPT_KIND, { copy: 'r1' })).toBe(
            'books/refund-receipts/new?copy=r1'
        )
        expect(documentNewHref(REFUND_RECEIPT_KIND, { replaces: 'r1' })).toBe(
            'books/refund-receipts/new?replaces=r1'
        )
    })

    it('opens a refund and its PDF tab', () => {
        expect(documentPath(REFUND_RECEIPT_KIND, 'r1')).toBe('books/refund-receipts/r1')
        expect(documentPath(REFUND_RECEIPT_KIND, 'r1', 'pdf')).toBe(
            'books/refund-receipts/r1?tab=pdf'
        )
    })

    it('Post & new starts a fresh refund, with the customer only when the form had one', () => {
        expect(postAndNewHref(REFUND_RECEIPT_KIND, undefined)).toMatch(
            /^books\/refund-receipts\/new\?fresh=[^&]+$/
        )
        expect(postAndNewHref(REFUND_RECEIPT_KIND, 'c1')).toMatch(
            /^books\/refund-receipts\/new\?fresh=[^&]+&customer=c1$/
        )
    })
})
