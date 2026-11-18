import { describe, expect, it } from 'vitest'
import {
    appliedBadge,
    type BalanceBadge,
    canDeleteStatus,
    isFormStatus,
    isReadOnlyStatus,
    paidBadge,
    quoteReadActions,
    statusBadgeOf,
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
        expect(quoteReadActions('pending', true, false)).toEqual(['copy', 'pdf'])
    })
})
