import { describe, expect, it } from 'vitest'
import {
    INVOICE_DOCUMENT,
    VENDOR_CREDIT_DOCUMENT,
} from '../tinycld/books/components/documents/document-kinds'
import {
    appliedBadge,
    type BalanceBadge,
    canDeleteStatus,
    creditMemoBadge,
    isFormStatus,
    isReadOnlyStatus,
    orderReadActions,
    paidBadge,
    quoteReadActions,
    statusBadgeOf,
    vendorCreditBadge,
    writtenOffBadge,
} from '../tinycld/books/lib/document-lifecycle'

// The sales document layer's lifecycles (spec §3.1): `posting` (invoice, sales receipt:
// draft → posted → void) and `quote` (estimate: pending / accepted / rejected → closed).
// Every shared file asks this module which statuses open the form, which open the read
// view, which may be deleted and how each status is drawn.

const OPEN_QUOTE = ['pending', 'accepted', 'rejected'] as const

describe('isFormStatus', () => {
    it('opens the form on a draft only in the posting lifecycle', () => {
        expect(isFormStatus('posting', 'draft')).toBe(true)
        expect(isFormStatus('posting', 'posted')).toBe(false)
    })

    it.each(OPEN_QUOTE)('opens the form on a %s quote', status => {
        expect(isFormStatus('quote', status)).toBe(true)
    })

    it('never opens the form on a closed quote', () => {
        expect(isFormStatus('quote', 'closed')).toBe(false)
    })
})

describe('isReadOnlyStatus', () => {
    it('reads a closed quote in the read view', () => {
        expect(isReadOnlyStatus('quote', 'closed')).toBe(true)
    })

    it.each(OPEN_QUOTE)('keeps a %s quote out of the read view', status => {
        expect(isReadOnlyStatus('quote', status)).toBe(false)
    })
})

describe('canDeleteStatus', () => {
    it('deletes a quote that is not closed', () => {
        expect(canDeleteStatus('quote', 'rejected')).toBe(true)
    })

    it('never deletes a closed quote or a posted document', () => {
        expect(canDeleteStatus('quote', 'closed')).toBe(false)
        expect(canDeleteStatus('posting', 'posted')).toBe(false)
    })
})

describe('statusBadgeOf', () => {
    it('draws each quote status with its tone (spec §7)', () => {
        expect(statusBadgeOf('quote', 'pending')).toEqual({ label: 'Pending', tone: 'info' })
        expect(statusBadgeOf('quote', 'accepted')).toEqual({ label: 'Accepted', tone: 'success' })
        expect(statusBadgeOf('quote', 'rejected')).toEqual({
            label: 'Rejected',
            tone: 'destructive',
        })
        expect(statusBadgeOf('quote', 'closed')).toEqual({ label: 'Closed', tone: 'muted' })
    })

    // EntryStatusBadge drew draft with border-border / text-muted-foreground, posted with
    // success and void with destructive, and the words of entryStatusText.
    it('draws the posting statuses with the words and tones EntryStatusBadge drew', () => {
        expect(statusBadgeOf('posting', 'draft')).toEqual({ label: 'Draft', tone: 'muted' })
        expect(statusBadgeOf('posting', 'posted')).toEqual({ label: 'Posted', tone: 'success' })
        expect(statusBadgeOf('posting', 'void')).toEqual({ label: 'Void', tone: 'destructive' })
    })
})

// Pay bills §3.9 (Q4) and receive payment §3.9: a posted invoice's or bill's badge follows
// its open balance, by one rule (`paidBadge`, receive payment's `invoiceBadge` renamed).
// Paid when nothing is open, Partly paid while part of the total is open, otherwise the
// posting badge.
describe('paidBadge', () => {
    it('reads Paid, success, on a posted document with no balance', () => {
        expect(paidBadge('posted', 0, 50000)).toEqual({ label: 'Paid', tone: 'success' })
    })

    it('reads Partly paid, warning, while part of the total is open', () => {
        expect(paidBadge('posted', 20000, 50000)).toEqual({ label: 'Partly paid', tone: 'warning' })
    })

    it('reads Posted on a posted document nothing has paid', () => {
        expect(paidBadge('posted', 50000, 50000)).toEqual({ label: 'Posted', tone: 'success' })
    })

    it('reads Void on a void document and Draft on a draft, whatever the balance', () => {
        expect(paidBadge('void', 0, 50000)).toEqual({ label: 'Void', tone: 'destructive' })
        expect(paidBadge('draft', 0, 0)).toEqual({ label: 'Draft', tone: 'muted' })
    })

    // The invoice keeps its badges: the same results as receive payment's cases above.
    it('gives the invoice cases the results they had', () => {
        expect(paidBadge('posted', 0, 500)).toEqual({ label: 'Paid', tone: 'success' })
        expect(paidBadge('posted', 200, 500)).toEqual({ label: 'Partly paid', tone: 'warning' })
        expect(paidBadge('posted', 500, 500)).toEqual(statusBadgeOf('posting', 'posted'))
        expect(paidBadge('draft', 0, 500)).toEqual({ label: 'Draft', tone: 'muted' })
        expect(paidBadge('void', 200, 500)).toEqual({ label: 'Void', tone: 'destructive' })
    })
})

// Vendor credit spec §3.7: a posted vendor credit's badge follows its unapplied balance,
// by paidBadge's rule with the vendor credit's words. Applied when nothing is left,
// Partly applied while part of the total is applied, otherwise the posting badge.
describe('appliedBadge', () => {
    // Both are a kind's balanceBadge; the same balances give each kind its own words.
    it('shares paidBadge rule with its own words', () => {
        const badges: BalanceBadge[] = [paidBadge, appliedBadge]
        expect(badges.map(badge => badge('posted', 2000, 5000).label)).toEqual([
            'Partly paid',
            'Partly applied',
        ])
        expect(badges.map(badge => badge('posted', 0, 5000).label)).toEqual(['Paid', 'Applied'])
    })

    it('reads Posted on a posted credit nothing is applied from', () => {
        expect(appliedBadge('posted', 5000, 5000)).toEqual({ label: 'Posted', tone: 'success' })
        expect(appliedBadge('posted', 5000, 5000)).toEqual(statusBadgeOf('posting', 'posted'))
    })

    it('reads Partly applied, warning, while 0 < balance < total', () => {
        expect(appliedBadge('posted', 2000, 5000)).toEqual({
            label: 'Partly applied',
            tone: 'warning',
        })
    })

    it('reads Applied, success, at balance 0', () => {
        expect(appliedBadge('posted', 0, 5000)).toEqual({ label: 'Applied', tone: 'success' })
    })

    it('keeps the posting badges of a draft and a void credit, whatever the balance', () => {
        expect(appliedBadge('draft', 0, 5000)).toEqual({ label: 'Draft', tone: 'muted' })
        expect(appliedBadge('void', 0, 5000)).toEqual({ label: 'Void', tone: 'destructive' })
        expect(appliedBadge('void', 2000, 5000)).toEqual({ label: 'Void', tone: 'destructive' })
    })
})

// Vendor refund spec §3.9 (Q4): a posted vendor credit reads Refunded (success) when its
// balance is 0 and nothing is applied to a bill; otherwise appliedBadge's words, where a
// refund counts as use of the credit. The arguments are appliedBadge's (status, balance,
// total) and the cents applied to bills.
describe('vendorCreditBadge', () => {
    it('reads Refunded, success, at balance 0 with nothing applied to a bill', () => {
        expect(vendorCreditBadge('posted', 0, 30_000, 0)).toEqual({
            label: 'Refunded',
            tone: 'success',
        })
    })

    it('reads Applied, success, at balance 0 with part applied to bills', () => {
        expect(vendorCreditBadge('posted', 0, 30_000, 10_000)).toEqual({
            label: 'Applied',
            tone: 'success',
        })
        expect(vendorCreditBadge('posted', 0, 30_000, 30_000)).toEqual({
            label: 'Applied',
            tone: 'success',
        })
    })

    it('reads Partly applied, warning, while 0 < balance < total with only refunds', () => {
        expect(vendorCreditBadge('posted', 18_000, 30_000, 0)).toEqual({
            label: 'Partly applied',
            tone: 'warning',
        })
    })

    it('reads Partly applied, warning, while 0 < balance < total with applications', () => {
        expect(vendorCreditBadge('posted', 18_000, 30_000, 12_000)).toEqual({
            label: 'Partly applied',
            tone: 'warning',
        })
    })

    it('reads Posted on a posted credit nothing has used', () => {
        expect(vendorCreditBadge('posted', 30_000, 30_000, 0)).toEqual({
            label: 'Posted',
            tone: 'success',
        })
    })

    it('keeps the status badges of a draft and a void credit', () => {
        expect(vendorCreditBadge('draft', 0, 30_000, 0)).toEqual({ label: 'Draft', tone: 'muted' })
        expect(vendorCreditBadge('void', 0, 30_000, 0)).toEqual({
            label: 'Void',
            tone: 'destructive',
        })
        expect(vendorCreditBadge('void', 18_000, 30_000, 0)).toEqual({
            label: 'Void',
            tone: 'destructive',
        })
    })
})

// The vendor credit read view's badge (VENDOR_CREDIT_DOCUMENT.balanceBadge): the refunded
// cents come from the posted refunds' read, null while that read has failed. With them
// unknown the used credit cannot be split into applied and refunded, so a credit used in
// full shows its status badge, not a split it does not know; Partly applied needs no split.
describe('VENDOR_CREDIT_DOCUMENT.balanceBadge', () => {
    const badgeOf = (
        ...args: Parameters<NonNullable<typeof VENDOR_CREDIT_DOCUMENT.balanceBadge>>
    ) => {
        const badge = VENDOR_CREDIT_DOCUMENT.balanceBadge
        if (badge === undefined) throw new Error('the vendor credit kind has no balance badge')
        return badge(...args)
    }

    it('reads Refunded at balance 0 when the refunds read gave the whole total', () => {
        expect(badgeOf('posted', 0, 30_000, 30_000, 0)).toEqual({
            label: 'Refunded',
            tone: 'success',
        })
    })

    it('reads the status badge (Posted), not Applied, at balance 0 while the refunds read has failed', () => {
        expect(badgeOf('posted', 0, 30_000, null, 0)).toEqual({ label: 'Posted', tone: 'success' })
    })

    it('reads Partly applied, warning, at a balance above 0 while the refunds read has failed', () => {
        expect(badgeOf('posted', 18_000, 30_000, null, 0)).toEqual({
            label: 'Partly applied',
            tone: 'warning',
        })
    })
})

// The invoice's badge after a write-off (write-off spec §3.4, plan decision 6): Written off,
// muted, when nothing is left and posted write-offs took some of it; otherwise paidBadge.
describe('writtenOffBadge', () => {
    it('reads Written off, muted, at balance 0 with a written-off amount', () => {
        expect(writtenOffBadge('posted', 0, 40_000, 40_000)).toEqual({
            label: 'Written off',
            tone: 'muted',
        })
    })

    it('reads Paid at balance 0 with nothing written off', () => {
        expect(writtenOffBadge('posted', 0, 40_000, 0)).toEqual({ label: 'Paid', tone: 'success' })
        expect(writtenOffBadge('posted', 0, 40_000, 0)).toEqual(paidBadge('posted', 0, 40_000))
    })

    it('gives what paidBadge gives while a balance is still open', () => {
        expect(writtenOffBadge('posted', 10_000, 40_000, 30_000)).toEqual(
            paidBadge('posted', 10_000, 40_000)
        )
        expect(writtenOffBadge('posted', 10_000, 40_000, 30_000)).toEqual({
            label: 'Partly paid',
            tone: 'warning',
        })
    })

    it('gives what paidBadge gives for a void invoice', () => {
        expect(writtenOffBadge('void', 0, 40_000, 40_000)).toEqual(paidBadge('void', 0, 40_000))
        expect(writtenOffBadge('void', 0, 40_000, 40_000)).toEqual({
            label: 'Void',
            tone: 'destructive',
        })
    })
})

// The invoice kind's badge passes the fifth argument, the stored written-off cents.
describe('INVOICE_DOCUMENT.balanceBadge', () => {
    const badgeOf = (...args: Parameters<NonNullable<typeof INVOICE_DOCUMENT.balanceBadge>>) => {
        const badge = INVOICE_DOCUMENT.balanceBadge
        if (badge === undefined) throw new Error('the invoice kind has no balance badge')
        return badge(...args)
    }

    it('reads Written off at balance 0 with a written-off amount, and Paid without one', () => {
        expect(badgeOf('posted', 0, 40_000, null, 40_000)).toEqual({
            label: 'Written off',
            tone: 'muted',
        })
        expect(badgeOf('posted', 0, 40_000, null, 0)).toEqual({ label: 'Paid', tone: 'success' })
    })
})

// The credit memo's balance badge (apply credit spec §3.5): Partly applied (warning) while a
// part is applied and some is left, Applied (success) when applications took the rest,
// Refunded (success) when refunds alone took it; otherwise no balance badge, so the status
// badge (Posted, Void) shows. A part refunded with nothing applied keeps Posted.
// Arguments: status, balance, total, applied (cents).
describe('creditMemoBadge', () => {
    it('gives no balance badge to a posted memo nothing has used', () => {
        expect(creditMemoBadge('posted', 25_000, 25_000, 0)).toBeUndefined()
    })

    it('reads Partly applied, warning, while a part is applied and a balance is left', () => {
        expect(creditMemoBadge('posted', 10_000, 25_000, 15_000)).toEqual({
            label: 'Partly applied',
            tone: 'warning',
        })
    })

    it('reads Applied, success, at balance 0 with a part applied', () => {
        expect(creditMemoBadge('posted', 0, 25_000, 25_000)).toEqual({
            label: 'Applied',
            tone: 'success',
        })
        expect(creditMemoBadge('posted', 0, 25_000, 10_000)).toEqual({
            label: 'Applied',
            tone: 'success',
        })
    })

    it('reads Refunded, success, at balance 0 with nothing applied', () => {
        expect(creditMemoBadge('posted', 0, 25_000, 0)).toEqual({
            label: 'Refunded',
            tone: 'success',
        })
    })

    it('gives no balance badge to a part refunded with nothing applied', () => {
        expect(creditMemoBadge('posted', 18_000, 25_000, 0)).toBeUndefined()
    })

    it('gives no balance badge to a void memo', () => {
        expect(creditMemoBadge('void', 25_000, 25_000, 0)).toBeUndefined()
        expect(creditMemoBadge('void', 0, 25_000, 0)).toBeUndefined()
        expect(creditMemoBadge('void', 10_000, 25_000, 15_000)).toBeUndefined()
    })
})

// The order lifecycle (purchase order spec §3.1): a purchase order is open or closed, never
// posts and has no draft. A writer edits an open order (with Edit, `?edit=1`); a closed
// order is read only and is not deleted.
describe('the order lifecycle', () => {
    it('opens the form on an open order and never on a closed one', () => {
        expect(isFormStatus('order', 'open')).toBe(true)
        expect(isFormStatus('order', 'closed')).toBe(false)
    })

    it('reads a closed order as read only and an open one as editable', () => {
        expect(isReadOnlyStatus('order', 'closed')).toBe(true)
        expect(isReadOnlyStatus('order', 'open')).toBe(false)
    })

    it('deletes an open order and never a closed one', () => {
        expect(canDeleteStatus('order', 'open')).toBe(true)
        expect(canDeleteStatus('order', 'closed')).toBe(false)
    })

    it('draws Open as info and Closed as muted', () => {
        expect(statusBadgeOf('order', 'open')).toEqual({ label: 'Open', tone: 'info' })
        expect(statusBadgeOf('order', 'closed')).toEqual({ label: 'Closed', tone: 'muted' })
    })

    it('gives the other lifecycles no answer for an order status', () => {
        expect(isFormStatus('quote', 'open')).toBe(false)
        expect(isFormStatus('posting', 'open')).toBe(false)
        expect(statusBadgeOf('posting', 'open')).toBeNull()
        expect(statusBadgeOf('quote', 'open')).toBeNull()
    })
})

// The read view's actions of a purchase order (spec §3.6), in the spec's order: a writer on
// an open order gets Copy to bill (with an open line), Edit, Send…, Copy, Download PDF and
// Delete; a Books admin also Close. A writer on a closed order gets Copy and Download PDF;
// an admin also Reopen on an order closed by hand. A reader gets Download PDF.
describe('orderReadActions', () => {
    const WRITER = { canWrite: true, isAdmin: false }
    const ADMIN = { canWrite: true, isAdmin: true }
    const READER = { canWrite: false, isAdmin: false }
    const OPEN = { status: 'open', closedReason: '' } as const
    const MANUAL = { status: 'closed', closedReason: 'manual' } as const
    const RECEIVED = { status: 'closed', closedReason: 'received' } as const

    it('gives a writer on an open order with an open line Copy to bill first, then Edit, Send…, Copy, Download PDF and Delete', () => {
        expect(orderReadActions({ ...OPEN, ...WRITER, hasOpenLine: true })).toEqual([
            'copy_to_bill',
            'edit',
            'send',
            'copy',
            'pdf',
            'delete',
        ])
    })

    it('gives a writer on an open order with no open line no Copy to bill', () => {
        expect(orderReadActions({ ...OPEN, ...WRITER, hasOpenLine: false })).toEqual([
            'edit',
            'send',
            'copy',
            'pdf',
            'delete',
        ])
    })

    it('gives a Books admin on an open order Close as well', () => {
        expect(orderReadActions({ ...OPEN, ...ADMIN, hasOpenLine: true })).toEqual([
            'copy_to_bill',
            'edit',
            'send',
            'copy',
            'pdf',
            'delete',
            'close',
        ])
        expect(orderReadActions({ ...OPEN, ...ADMIN, hasOpenLine: false })).toEqual([
            'edit',
            'send',
            'copy',
            'pdf',
            'delete',
            'close',
        ])
    })

    it.each([
        true,
        false,
    ])('gives a writer on a closed order Copy and Download PDF only (open line: %s)', hasOpenLine => {
        expect(orderReadActions({ ...MANUAL, ...WRITER, hasOpenLine })).toEqual(['copy', 'pdf'])
        expect(orderReadActions({ ...RECEIVED, ...WRITER, hasOpenLine })).toEqual(['copy', 'pdf'])
    })

    it.each([
        true,
        false,
    ])('gives a Books admin Reopen on an order closed by hand only (open line: %s)', hasOpenLine => {
        expect(orderReadActions({ ...MANUAL, ...ADMIN, hasOpenLine })).toEqual([
            'copy',
            'pdf',
            'reopen',
        ])
        expect(orderReadActions({ ...RECEIVED, ...ADMIN, hasOpenLine })).toEqual(['copy', 'pdf'])
    })

    it.each([OPEN, MANUAL, RECEIVED])('gives a reader Download PDF only (%o)', state => {
        expect(orderReadActions({ ...state, ...READER, hasOpenLine: true })).toEqual(['pdf'])
        expect(orderReadActions({ ...state, ...READER, hasOpenLine: false })).toEqual(['pdf'])
    })
})

describe('quoteReadActions', () => {
    it('gives a writer Copy then Download PDF on a closed estimate', () => {
        expect(quoteReadActions('closed', true, false)).toEqual(['copy', 'pdf'])
    })

    it('gives a reader Download PDF only', () => {
        expect(quoteReadActions('closed', false, false)).toEqual(['pdf'])
        expect(quoteReadActions('pending', false, false)).toEqual(['pdf'])
    })

    // Spec §3.8: Open invoice on a closed estimate, first, for every user.
    // An open estimate has no invoice, so it offers no Open invoice.
    it('puts Open invoice first on a closed estimate that has its invoice, for a writer and a reader', () => {
        expect(quoteReadActions('closed', true, true)).toEqual(['invoice', 'copy', 'pdf'])
        expect(quoteReadActions('closed', false, true)).toEqual(['invoice', 'pdf'])
        // A writer's pending estimate also offers Send… (email-share plan decision 12).
        expect(quoteReadActions('pending', true, false)).toEqual(['send', 'copy', 'pdf'])
    })
})
