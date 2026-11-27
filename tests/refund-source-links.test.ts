import { describe, expect, it } from 'vitest'
import {
    CREDIT_MEMO_DOCUMENT,
    REFUND_RECEIPT_DOCUMENT,
} from '../tinycld/books/components/documents/document-kinds'
import { CREDIT_MEMO_IDS, CREDIT_MEMOS } from '../tinycld/books/lib/credit-memo-form-fixture'
import {
    DOCUMENT_READ_KEYS,
    DOCUMENT_READ_LABELS,
    documentReadActions,
    refundCreditOffered,
    refundReceiptOffered,
} from '../tinycld/books/lib/document-actions'
import { documentScreenState } from '../tinycld/books/lib/document-screen-state'
import {
    linkSourceLabel,
    linkSourcePartyOf,
    payoutUnappliedText,
    purchaseOrderLinkLabel,
    refundSourceLabel,
    sourceLinkRules,
    sourceParamOf,
} from '../tinycld/books/lib/document-source-links'
import { PURCHASE_ORDER_IDS, PURCHASE_ORDERS } from '../tinycld/books/lib/purchase-orders-fixture'
import { SALES_FEATURES } from '../tinycld/books/lib/sales-document-kinds'
import { SALES_RECEIPT_IDS, SALES_RECEIPTS } from '../tinycld/books/lib/sales-receipt-form-fixture'

// The source link of a refund receipt (spec §3.2, §3.3, §3.8), the two read actions that
// start one (§3.4, §3.11, §3.12) and the cannot-start state (§3.10).

describe('refundSourceLabel', () => {
    it('names a sales receipt, and marks a void one', () => {
        expect(refundSourceLabel({ key: 'sales_receipt', number: '1004', status: 'posted' })).toBe(
            'Refund of sales receipt 1004'
        )
        expect(refundSourceLabel({ key: 'sales_receipt', number: '1004', status: 'void' })).toBe(
            'Refund of sales receipt 1004 (void)'
        )
    })

    it('names a credit memo it pays out, and marks a void one', () => {
        expect(refundSourceLabel({ key: 'credit_memo', number: '1001', status: 'posted' })).toBe(
            'Pays out credit memo 1001'
        )
        expect(refundSourceLabel({ key: 'credit_memo', number: '1001', status: 'void' })).toBe(
            'Pays out credit memo 1001 (void)'
        )
    })
})

// The payout's link holds only the memo's words; the unapplied credit is plain text drawn
// right after the link (spec §3.3, reference payout-1280). The browser joins the two texts
// with no separator, so the detail carries its own leading space.
// A bill's link to the purchase order it is made from (purchase order spec §3.7, §3.8, Q10).
describe('the purchase order source link', () => {
    function orderSource() {
        const row = PURCHASE_ORDERS.find(order => order.id === PURCHASE_ORDER_IDS.open)
        if (!row) throw new Error('no open purchase order in the fixture')
        return { key: 'purchase_order' as const, row: { ...row, lines: [], choice: undefined } }
    }

    it('keeps the order and locks the vendor: no Remove link', () => {
        expect(sourceLinkRules({ key: 'purchase_order', id: PURCHASE_ORDER_IDS.open })).toEqual({
            canRemove: false,
            locksParty: true,
        })
    })

    it('leaves the other links as they were', () => {
        expect(sourceLinkRules({ key: 'credit_memo', id: 'm' })).toEqual({
            canRemove: false,
            locksParty: true,
        })
        expect(sourceLinkRules({ key: 'invoice', id: 'i' })).toEqual({
            canRemove: true,
            locksParty: false,
        })
        expect(sourceLinkRules({ key: 'sales_receipt', id: 's' })).toEqual({
            canRemove: true,
            locksParty: false,
        })
        expect(sourceLinkRules({ key: '', id: '' })).toEqual({
            canRemove: false,
            locksParty: false,
        })
    })

    it('reads ?purchase_order as the link a new bill starts with', () => {
        expect(sourceParamOf({ purchaseOrder: 'po1004offsup001' })).toEqual({
            key: 'purchase_order',
            id: 'po1004offsup001',
        })
        expect(sourceParamOf({})).toEqual({ key: '', id: '' })
    })

    it("gives the order's vendor as the party of the link", () => {
        const source = orderSource()
        expect(source.row.vendor).not.toBe('')
        expect(linkSourcePartyOf(source)).toBe(source.row.vendor)
    })

    it('words the link "From purchase order <n>"', () => {
        expect(purchaseOrderLinkLabel('1004')).toBe('From purchase order 1004')
        const source = orderSource()
        expect(linkSourceLabel(source)).toBe(`From purchase order ${source.row.number}`)
    })
})

describe('payoutUnappliedText', () => {
    it("gives the unapplied credit in the book's money, with a leading space", () => {
        expect(payoutUnappliedText(25_000, 'USD')).toBe(' · $250.00 unapplied')
        expect(payoutUnappliedText(41_092, 'USD')).toBe(' · $410.92 unapplied')
    })

    it('shows no unapplied credit as zero', () => {
        expect(payoutUnappliedText(0, 'USD')).toBe(' · $0.00 unapplied')
    })

    it("joins the link's words into the row's whole text", () => {
        const link = refundSourceLabel({ key: 'credit_memo', number: '1001', status: 'posted' })
        expect(`${link}${payoutUnappliedText(25_000, 'USD')}`).toBe(
            'Pays out credit memo 1001 · $250.00 unapplied'
        )
    })
})

describe('refundReceiptOffered', () => {
    it('is true only for a posted sales receipt', () => {
        expect(refundReceiptOffered('sales_receipt', 'posted')).toBe(true)
        expect(refundReceiptOffered('sales_receipt', 'void')).toBe(false)
        expect(refundReceiptOffered('sales_receipt', 'draft')).toBe(false)
        expect(refundReceiptOffered('invoice', 'posted')).toBe(false)
        expect(refundReceiptOffered('credit_memo', 'posted')).toBe(false)
        expect(refundReceiptOffered('refund_receipt', 'posted')).toBe(false)
    })
})

describe('refundCreditOffered', () => {
    it('is true only for a posted credit memo with unapplied credit', () => {
        expect(refundCreditOffered('credit_memo', 'posted', 1)).toBe(true)
        expect(refundCreditOffered('credit_memo', 'posted', 25_000)).toBe(true)
        expect(refundCreditOffered('credit_memo', 'posted', 0)).toBe(false)
        expect(refundCreditOffered('credit_memo', 'void', 25_000)).toBe(false)
        expect(refundCreditOffered('credit_memo', 'draft', 25_000)).toBe(false)
        expect(refundCreditOffered('vendor_credit', 'posted', 25_000)).toBe(false)
        expect(refundCreditOffered('sales_receipt', 'posted', 25_000)).toBe(false)
    })
})

const NO_EXTRA = { canReceivePayment: false, canPayBill: false, canCreateCreditMemo: false }

describe('documentReadActions with Refund and Refund credit', () => {
    it('puts Refund right after Copy for a writer on a posted sales receipt', () => {
        expect(
            documentReadActions('posted', true, SALES_FEATURES, { ...NO_EXTRA, canRefund: true })
        ).toEqual(['edit', 'void', 'copy', 'refund', 'entry', 'pdf'])
    })

    it('puts Refund credit right after Copy for a writer on a posted credit memo', () => {
        expect(
            documentReadActions('posted', true, SALES_FEATURES, {
                ...NO_EXTRA,
                canRefundCredit: true,
            })
        ).toEqual(['edit', 'void', 'copy', 'refund_credit', 'entry', 'pdf'])
    })

    it('offers neither to a reader nor on a void document', () => {
        const both = { ...NO_EXTRA, canRefund: true, canRefundCredit: true }
        expect(documentReadActions('posted', false, SALES_FEATURES, both)).toEqual(['entry', 'pdf'])
        expect(documentReadActions('void', true, SALES_FEATURES, both)).toEqual([
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('offers neither when the flags are not set', () => {
        const actions = documentReadActions('posted', true, SALES_FEATURES, NO_EXTRA)
        expect(actions).not.toContain('refund')
        expect(actions).not.toContain('refund_credit')
    })

    it('keys both on R, with the labels Refund and Refund credit', () => {
        expect(DOCUMENT_READ_KEYS.refund).toBe('r')
        expect(DOCUMENT_READ_KEYS.refund_credit).toBe('r')
        expect(DOCUMENT_READ_LABELS.refund).toBe('Refund')
        expect(DOCUMENT_READ_LABELS.refund_credit).toBe('Refund credit')
    })
})

type Input = Parameters<typeof documentScreenState>[0]

// A writer on `books/refund-receipts/new`, every read ready.
const NEW: Input = {
    lifecycle: 'posting',
    isReady: true,
    isError: false,
    canWrite: true,
    isNew: true,
    status: null,
    isHeld: false,
    replacesStatus: undefined,
}

describe('documentScreenState with a source', () => {
    it('is cannot-start when the source is not allowed, and the form when it is', () => {
        expect(documentScreenState({ ...NEW, sourceAllowed: false })).toBe('cannot-start')
        expect(documentScreenState({ ...NEW, sourceAllowed: true })).toBe('form')
    })

    it('is cannot-start for a source that does not exist or cannot be read', () => {
        expect(documentScreenState({ ...NEW, sourceAllowed: null })).toBe('cannot-start')
    })

    it('a form with no source is unchanged', () => {
        expect(documentScreenState({ ...NEW, sourceAllowed: undefined })).toBe('form')
        expect(documentScreenState({ ...NEW, sourceAllowed: undefined, canWrite: false })).toBe(
            'no-access'
        )
    })

    it('a failed or loading read wins over the source', () => {
        expect(documentScreenState({ ...NEW, sourceAllowed: false, isError: true })).toBe('error')
        expect(documentScreenState({ ...NEW, sourceAllowed: false, isReady: false })).toBe(
            'loading'
        )
    })

    it('a reader gets no access, not cannot-start', () => {
        expect(documentScreenState({ ...NEW, sourceAllowed: false, canWrite: false })).toBe(
            'no-access'
        )
    })
})

function receiptOf(id: string) {
    const row = SALES_RECEIPTS.find(r => r.id === id)
    if (!row) throw new Error(`no sales receipt ${id} in the fixture`)
    return row
}

function memoOf(id: string) {
    const row = CREDIT_MEMOS.find(m => m.id === id)
    if (!row) throw new Error(`no credit memo ${id} in the fixture`)
    return row
}

describe('REFUND_RECEIPT_DOCUMENT.sourceAllowed', () => {
    const allowed = (
        source: Parameters<NonNullable<typeof REFUND_RECEIPT_DOCUMENT.sourceAllowed>>[0]
    ) => {
        const rule = REFUND_RECEIPT_DOCUMENT.sourceAllowed
        if (!rule) throw new Error('the refund receipt kind has no sourceAllowed')
        return rule(source)
    }

    it('allows a posted sales receipt, never a draft or a void one', () => {
        const posted = receiptOf(SALES_RECEIPT_IDS.posted)
        expect(posted.status).toBe('posted')
        expect(allowed({ key: 'sales_receipt', row: posted })).toBe(true)
        const draft = receiptOf(SALES_RECEIPT_IDS.draft)
        expect(draft.status).toBe('draft')
        expect(allowed({ key: 'sales_receipt', row: draft })).toBe(false)
        const voided = receiptOf(SALES_RECEIPT_IDS.voided)
        expect(voided.status).toBe('void')
        expect(allowed({ key: 'sales_receipt', row: voided })).toBe(false)
    })

    it('allows a posted credit memo with unapplied credit only', () => {
        const posted = memoOf(CREDIT_MEMO_IDS.posted)
        expect(posted.status).toBe('posted')
        expect(posted.balance).toBeGreaterThan(0)
        expect(allowed({ key: 'credit_memo', row: posted })).toBe(true)
        expect(allowed({ key: 'credit_memo', row: { ...posted, balance: 0 } })).toBe(false)
        const draft = memoOf(CREDIT_MEMO_IDS.draft)
        expect(draft.status).toBe('draft')
        expect(allowed({ key: 'credit_memo', row: draft })).toBe(false)
        const voided = memoOf(CREDIT_MEMO_IDS.voided)
        expect(voided.status).toBe('void')
        expect(allowed({ key: 'credit_memo', row: { ...voided, balance: 5_000 } })).toBe(false)
    })
})

describe('sourceNotice', () => {
    it("keeps the credit memo's cannot-credit notice", () => {
        expect(CREDIT_MEMO_DOCUMENT.sourceNotice?.('invoice')).toEqual({
            testId: 'credit-memo-cannot-credit',
            message: 'This invoice cannot be credited',
        })
    })

    it("gives the refund receipt one notice id with each source's text", () => {
        expect(REFUND_RECEIPT_DOCUMENT.sourceNotice?.('sales_receipt')).toEqual({
            testId: 'refund-receipt-cannot-refund',
            message: 'This sales receipt cannot be refunded',
        })
        expect(REFUND_RECEIPT_DOCUMENT.sourceNotice?.('credit_memo')).toEqual({
            testId: 'refund-receipt-cannot-refund',
            message: 'This credit memo cannot be refunded',
        })
    })
})
