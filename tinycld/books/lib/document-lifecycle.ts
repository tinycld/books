// What a sales document's status means in its kind's lifecycle (spec §3.1). The posting
// kinds (invoice, sales receipt) run draft → posted → void; a quote (estimate) runs
// pending / accepted / rejected → closed and never posts. Every shared file of the
// document layer asks this module instead of naming statuses. Pure, so each rule is
// unit-tested.

import type { BooksEstimates, BooksInvoices, BooksJournalEntries } from '../types'
import type { DocumentReadAction } from './document-actions'
import { entryStatusText } from './entry-display'
import { estimateStatusLabel } from './estimate-status'
import type { DocumentLifecycle } from './sales-document-kinds'

export type DocumentStatus = BooksInvoices['status'] | BooksEstimates['status']

type PostingStatus = BooksJournalEntries['status']

function isPostingStatus(status: DocumentStatus): status is PostingStatus {
    return status === 'draft' || status === 'posted' || status === 'void'
}

// A writer edits the document in the form: a posting draft, an open quote.
export function isFormStatus(lifecycle: DocumentLifecycle, status: DocumentStatus): boolean {
    if (lifecycle === 'posting') return status === 'draft'
    return status === 'pending' || status === 'accepted' || status === 'rejected'
}

// The document opens in the read view for everyone: posted or void, a closed quote.
export function isReadOnlyStatus(lifecycle: DocumentLifecycle, status: DocumentStatus): boolean {
    if (lifecycle === 'posting') return status === 'posted' || status === 'void'
    return status === 'closed'
}

// A posting kind deletes only a draft; a quote may be deleted until an invoice closes it.
export function canDeleteStatus(lifecycle: DocumentLifecycle, status: DocumentStatus): boolean {
    if (lifecycle === 'posting') return status === 'draft'
    return status !== 'closed'
}

export type StatusTone = 'info' | 'success' | 'destructive' | 'muted' | 'warning'

const POSTING_TONES: Record<PostingStatus, StatusTone> = {
    draft: 'muted',
    posted: 'success',
    void: 'destructive',
}

const QUOTE_TONES: Record<BooksEstimates['status'], StatusTone> = {
    pending: 'info',
    accepted: 'success',
    rejected: 'destructive',
    closed: 'muted',
}

function isQuoteStatus(status: DocumentStatus): status is BooksEstimates['status'] {
    return Object.hasOwn(QUOTE_TONES, status)
}

// The badge of a status (spec §7): the posting kinds keep the words and tones of the
// entry badges; a quote's are Pending info, Accepted success, Rejected destructive and
// Closed muted. null for a status the lifecycle does not have.
export function statusBadgeOf(
    lifecycle: DocumentLifecycle,
    status: DocumentStatus
): { label: string; tone: StatusTone } | null {
    if (lifecycle === 'posting') {
        if (!isPostingStatus(status)) return null
        return { label: entryStatusText(status), tone: POSTING_TONES[status] }
    }
    if (!isQuoteStatus(status)) return null
    return { label: estimateStatusLabel(status), tone: QUOTE_TONES[status] }
}

// The read view's actions of a quote (a closed estimate, or any estimate for a reader):
// Open invoice first for everyone on a closed estimate that names its invoice, Copy for
// writers, then Download PDF for everyone. No Edit, no Void and no journal entry: a
// quote never posts.
export function quoteReadActions(
    status: DocumentStatus,
    canWrite: boolean,
    hasInvoice: boolean
): DocumentReadAction[] {
    const actions: DocumentReadAction[] = []
    if (status === 'closed' && hasInvoice) actions.push('invoice')
    if (canWrite) actions.push('copy')
    actions.push('pdf')
    return actions
}
