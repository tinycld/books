import { describe, expect, it } from 'vitest'
import {
    canDeleteStatus,
    isFormStatus,
    isReadOnlyStatus,
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

describe('quoteReadActions', () => {
    it('gives a writer Copy then Download PDF on a closed estimate', () => {
        expect(quoteReadActions('closed', true, false)).toEqual(['copy', 'pdf'])
    })

    it('gives a reader Download PDF only', () => {
        expect(quoteReadActions('closed', false, false)).toEqual(['pdf'])
        expect(quoteReadActions('pending', false, false)).toEqual(['pdf'])
    })
})
