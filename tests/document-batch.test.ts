import { describe, expect, it } from 'vitest'
import {
    batchActionsOf,
    batchDialogCopy,
    batchResultText,
    batchTargets,
} from '../tinycld/books/lib/document-batch'
import type { DocumentListRow, ListKind } from '../tinycld/books/lib/document-list'
import {
    batchSendCopy,
    batchSendCounts,
    batchSendOffered,
} from '../tinycld/books/lib/document-send'
import { purchaseTabOf } from '../tinycld/books/lib/purchase-lists'

// The batch actions of a sales or purchase list (spec §3 "Batch actions"): which ticked
// documents an action applies to, the confirm dialog's words, and the result banner's text.

let next = 0

function row(kind: ListKind, recordStatus: string): DocumentListRow {
    next += 1
    const id = `doc${String(next).padStart(12, '0')}`
    return {
        id,
        key: recordStatus === 'draft' ? id : String(1000 + next),
        kind,
        number: recordStatus === 'draft' ? '' : String(1000 + next),
        date: '2026-11-17',
        dueDate: '',
        total: 100,
        currency: 'USD',
        created: '2026-11-17 10:00:00.000Z',
        status: { label: recordStatus, tone: 'muted' },
        sequence: recordStatus === 'draft' ? 0 : 1000 + next,
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
        email: '',
    }
}

const ids = (rows: readonly DocumentListRow[]) => rows.map(listed => listed.id)

// Purchase order spec §3.9: the Purchase orders tab's Batch actions are Send and Download
// PDF; a purchase order is never a draft and never posts, so Delete drafts and Void take
// none of its rows, and the batch send takes an open order with an address and skips a
// closed one.
describe('the batch actions of the Purchase orders tab', () => {
    const order = (status: 'open' | 'closed', email: string) => ({
        ...row('purchase_order', status),
        email,
    })

    it('are Send and Download PDF', () => {
        expect(batchActionsOf(purchaseTabOf('purchase-orders'))).toEqual(['send', 'pdf'])
    })

    it('Delete drafts and Void take no purchase order', () => {
        const rows = [order('open', 'ap@vendor.test'), order('closed', 'ap@vendor.test')]
        expect(batchTargets('delete_drafts', rows)).toEqual({ applies: [], skipped: 2 })
        expect(batchTargets('void', rows)).toEqual({ applies: [], skipped: 2 })
    })

    it('Send takes an open order with an address and skips a closed one', () => {
        const rows = [
            order('open', 'ap@vendor.test'),
            order('open', ''),
            order('closed', 'ap@vendor.test'),
        ]
        expect(batchSendOffered(rows, true)).toBe(true)
        const counts = batchSendCounts(rows)
        expect(counts).toEqual({ sendable: 1, noAddress: 1, notSendable: 0, closed: 1 })
        expect(batchSendCopy(counts, true).skipped).toBe(
            '2 are skipped: 1 has no email address, 1 is closed.'
        )
    })
})

describe('batchTargets', () => {
    it('delete_drafts applies to the drafts of every kind and skips the others', () => {
        const drafts = [
            row('invoice', 'draft'),
            row('sales_receipt', 'draft'),
            row('payment', 'draft'),
            row('credit_memo', 'draft'),
        ]
        const others = [
            row('invoice', 'posted'),
            row('invoice', 'void'),
            row('estimate', 'pending'),
            row('payment', 'posted'),
        ]
        const result = batchTargets('delete_drafts', [
            ...others.slice(0, 2),
            ...drafts,
            ...others.slice(2),
        ])
        expect(ids(result.applies)).toEqual(ids(drafts))
        expect(result.skipped).toBe(4)
    })

    it('void applies to posted invoices, sales receipts, payments and credit memos only', () => {
        const posted = [
            row('invoice', 'posted'),
            row('sales_receipt', 'posted'),
            row('payment', 'posted'),
            row('credit_memo', 'posted'),
        ]
        const never = [
            row('estimate', 'pending'),
            row('estimate', 'accepted'),
            row('estimate', 'closed'),
            row('invoice', 'draft'),
            row('payment', 'draft'),
            row('invoice', 'void'),
            row('sales_receipt', 'void'),
            row('credit_memo', 'void'),
        ]
        const result = batchTargets('void', [...never.slice(0, 4), ...posted, ...never.slice(4)])
        expect(ids(result.applies)).toEqual(ids(posted))
        expect(result.skipped).toBe(8)
    })

    it('delete_drafts takes the drafts of the four purchase kinds that have drafts', () => {
        const drafts = [
            row('bill', 'draft'),
            row('expense', 'draft'),
            row('vendor_credit', 'draft'),
            row('vendor_refund', 'draft'),
        ]
        const others = [
            row('bill', 'posted'),
            row('bill_payment', 'posted'),
            row('expense', 'void'),
            row('vendor_credit', 'posted'),
        ]
        const result = batchTargets('delete_drafts', [
            others[0],
            ...drafts.slice(0, 2),
            others[1],
            ...drafts.slice(2),
            ...others.slice(2),
        ])
        expect(ids(result.applies)).toEqual(ids(drafts))
        expect(result.skipped).toBe(4)
    })

    it('delete_drafts never takes a bill payment, whatever its status', () => {
        const payments = [
            row('bill_payment', 'posted'),
            row('bill_payment', 'void'),
            row('bill_payment', 'draft'),
        ]
        const result = batchTargets('delete_drafts', payments)
        expect(result.applies).toEqual([])
        expect(result.skipped).toBe(3)
    })

    it('void takes the posted rows of all five purchase kinds', () => {
        const posted = [
            row('bill', 'posted'),
            row('expense', 'posted'),
            row('bill_payment', 'posted'),
            row('vendor_credit', 'posted'),
            row('vendor_refund', 'posted'),
        ]
        const never = [
            row('bill', 'draft'),
            row('expense', 'draft'),
            row('vendor_credit', 'draft'),
            row('vendor_refund', 'draft'),
        ]
        const result = batchTargets('void', [...never.slice(0, 2), ...posted, ...never.slice(2)])
        expect(ids(result.applies)).toEqual(ids(posted))
        expect(result.skipped).toBe(4)
    })

    it('a void purchase row is skipped by both actions', () => {
        const voided = [
            row('bill', 'void'),
            row('expense', 'void'),
            row('bill_payment', 'void'),
            row('vendor_credit', 'void'),
            row('vendor_refund', 'void'),
        ]
        for (const action of ['delete_drafts', 'void'] as const) {
            const result = batchTargets(action, voided)
            expect(result.applies).toEqual([])
            expect(result.skipped).toBe(5)
        }
    })

    it('on Sales a posted estimate is still skipped by Void', () => {
        const invoice = row('invoice', 'posted')
        const result = batchTargets('void', [row('estimate', 'posted'), invoice])
        expect(ids(result.applies)).toEqual([invoice.id])
        expect(result.skipped).toBe(1)
    })

    // Refund receipt spec §3.13: batch actions as the sales receipts tab.
    it.each([
        'draft',
        'posted',
        'void',
    ])('a %s refund receipt takes the batch actions a sales receipt of that status takes', status => {
        for (const action of ['delete_drafts', 'void'] as const) {
            const refundRow = row('refund_receipt', status)
            const receiptRow = row('sales_receipt', status)
            const refund = batchTargets(action, [refundRow])
            const receipt = batchTargets(action, [receiptRow])
            expect(
                refund.applies.some(r => r.id === refundRow.id),
                `${action} on a ${status} refund`
            ).toBe(receipt.applies.some(r => r.id === receiptRow.id))
            expect(refund.skipped).toBe(receipt.skipped)
        }
    })

    it('void applies to a posted refund receipt and delete_drafts to a draft one', () => {
        const posted = row('refund_receipt', 'posted')
        const draft = row('refund_receipt', 'draft')
        expect(ids(batchTargets('void', [posted, draft]).applies)).toEqual([posted.id])
        expect(ids(batchTargets('delete_drafts', [posted, draft]).applies)).toEqual([draft.id])
    })

    // Write-off spec §5 (Q13): no batch action reaches a write-off.
    it('no batch action applies to a write-off row, posted or void', () => {
        for (const action of ['delete_drafts', 'void'] as const) {
            const result = batchTargets(action, [
                row('write_off', 'posted'),
                row('write_off', 'void'),
            ])
            expect(result.applies).toEqual([])
            expect(result.skipped).toBe(2)
        }
    })

    it('an action that applies to none skips every ticked document', () => {
        const result = batchTargets('void', [row('estimate', 'pending'), row('invoice', 'draft')])
        expect(result.applies).toEqual([])
        expect(result.skipped).toBe(2)
    })
})

describe('batchDialogCopy', () => {
    it('delete_drafts, 3 and 2: plural words', () => {
        const copy = batchDialogCopy('delete_drafts', 3, 2)
        expect(copy.title).toBe('Delete 3 drafts?')
        expect(copy.body.startsWith('2 selected documents are not drafts and stay.')).toBe(true)
        expect(copy.confirmLabel).not.toBeNull()
    })

    it('delete_drafts, 1 and 1: singular words', () => {
        const copy = batchDialogCopy('delete_drafts', 1, 1)
        expect(copy.title).toBe('Delete 1 draft?')
        expect(copy.body.startsWith('1 selected document is not a draft and stays.')).toBe(true)
        expect(copy.confirmLabel).not.toBeNull()
    })

    it('delete_drafts, none applying: says so and has no confirm', () => {
        expect(batchDialogCopy('delete_drafts', 0, 3)).toEqual({
            title: 'No drafts to delete',
            body: 'None of the 3 selected documents is a draft.',
            confirmLabel: null,
        })
    })

    it('void, 2 applying: "Void 2 documents?" with a confirm', () => {
        const copy = batchDialogCopy('void', 2, 0)
        expect(copy.title).toBe('Void 2 documents?')
        expect(copy.confirmLabel).not.toBeNull()
    })

    it('void, none applying: "No documents to void" with no confirm', () => {
        const copy = batchDialogCopy('void', 0, 2)
        expect(copy.title).toBe('No documents to void')
        expect(copy.confirmLabel).toBeNull()
    })
})

describe('batchResultText', () => {
    it('counts the done and the refused, with the first refusal', () => {
        expect(batchResultText(2, ['The period is closed.'])).toBe(
            '2 done, 1 refused: The period is closed.'
        )
    })

    it('names only the first of several refusals', () => {
        expect(batchResultText(0, ['The period is closed.', 'Another refusal.'])).toBe(
            '0 done, 2 refused: The period is closed.'
        )
    })

    it('with no refusal, no text after the counts', () => {
        expect(batchResultText(3, [])).toBe('3 done, 0 refused')
    })
})
