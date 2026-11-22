// What a sales document's status means in its kind's lifecycle (spec §3.1). The posting
// kinds (invoice, sales receipt) run draft → posted → void; a quote (estimate) runs
// pending / accepted / rejected → closed and never posts. Every shared file of the
// document layer asks this module instead of naming statuses. Pure, so each rule is
// unit-tested.

import type { BooksEstimates, BooksInvoices, BooksJournalEntries } from '../types'
import type { DocumentReadAction } from './document-actions'
import { sendOffered } from './document-send'
import { entryStatusText } from './entry-display'
import { estimateStatusLabel } from './estimate-status'
import type { DocumentLifecycle } from './sales-document-kinds'

export type DocumentStatus = BooksInvoices['status'] | BooksEstimates['status']

export type PostingStatus = BooksJournalEntries['status']

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

// A document status as a quote's, or undefined for a status a quote does not have.
export function quoteStatusOf(
    status: DocumentStatus | undefined
): BooksEstimates['status'] | undefined {
    return status !== undefined && isQuoteStatus(status) ? status : undefined
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

// The read view's badge of a kind whose posted documents keep an open balance
// (DocumentKind.balanceBadge). `balance` and `total` are in cents.
export type BalanceBadge = (
    status: PostingStatus,
    balance: number,
    total: number
) => { label: string; tone: StatusTone }

// The one rule of a balance badge, with the kind's words: a posted document reads `done`
// (success) when nothing is open and `partly` (warning) while part of its total is open;
// otherwise its posting badge.
function balanceBadgeWith(words: { done: string; partly: string }): BalanceBadge {
    return (status, balance, total) => {
        if (status === 'posted' && balance <= 0) return { label: words.done, tone: 'success' }
        if (status === 'posted' && balance < total) {
            return { label: words.partly, tone: 'warning' }
        }
        return { label: entryStatusText(status), tone: POSTING_TONES[status] }
    }
}

// The badge of a document that is paid (receive-payment spec §3.9, pay-bills spec §3.9):
// a posted invoice or bill reads Paid or Partly paid.
export const paidBadge: BalanceBadge = balanceBadgeWith({ done: 'Paid', partly: 'Partly paid' })

// The badge of an invoice after a write-off (write-off spec §3.4): a posted invoice with
// nothing open reads Written off (muted) when its posted write-offs took some of it
// (`writtenOff`, the stored cents of `books_invoices.written_off`); otherwise paidBadge.
export function writtenOffBadge(
    status: PostingStatus,
    balance: number,
    total: number,
    writtenOff: number
): { label: string; tone: StatusTone } {
    if (status === 'posted' && balance <= 0 && writtenOff > 0) {
        return { label: 'Written off', tone: 'muted' }
    }
    return paidBadge(status, balance, total)
}

// The badge of a vendor credit (vendor credit spec §3.7): a posted credit reads Applied
// when nothing is left to apply and Partly applied while part of it is applied.
export const appliedBadge: BalanceBadge = balanceBadgeWith({
    done: 'Applied',
    partly: 'Partly applied',
})

// The badge of a vendor credit after vendor refunds (vendor refund spec §3.9, Q4): a posted
// credit with nothing left reads Refunded (success) when nothing of it is applied to a
// bill; otherwise appliedBadge's words, where a refund counts as use of the credit.
// `appliedToBills` is in cents, or null while the refunds are not known (their read
// failed): a credit with nothing left then shows its status badge, because Applied and
// Refunded would each state a split that is not known.
export function vendorCreditBadge(
    status: PostingStatus,
    balance: number,
    total: number,
    appliedToBills: number | null
): { label: string; tone: StatusTone } {
    const isUsedUp = status === 'posted' && balance <= 0
    if (isUsedUp && appliedToBills === null) {
        return { label: entryStatusText(status), tone: POSTING_TONES[status] }
    }
    if (isUsedUp && appliedToBills !== null && appliedToBills <= 0) {
        return { label: 'Refunded', tone: 'success' }
    }
    return appliedBadge(status, balance, total)
}

// The balance badge of a credit memo (apply credit spec §3.5), from its stored `applied`
// (cents of its applications): a posted memo reads Partly applied (warning) while a part is
// applied and some is left, Applied (success) when nothing is left and a part is applied,
// and Refunded (success) when refunds alone took it. Otherwise undefined: the status badge
// (Posted, Void) shows, also for a memo partly refunded with nothing applied.
export function creditMemoBadge(
    status: PostingStatus,
    balance: number,
    total: number,
    applied: number
): { label: string; tone: StatusTone } | undefined {
    if (status !== 'posted') return undefined
    if (balance <= 0) {
        return applied > 0
            ? { label: 'Applied', tone: 'success' }
            : { label: 'Refunded', tone: 'success' }
    }
    if (applied > 0 && balance < total) return { label: 'Partly applied', tone: 'warning' }
    return undefined
}

// The read view's actions of a quote (a closed estimate, or any estimate for a reader):
// Open invoice first for everyone on a closed estimate that names its invoice, Send… for
// writers on an estimate that can be sent (pending, accepted or rejected: sendOffered;
// email-share plan decision 12), Copy for writers, then Download PDF for everyone. No Edit,
// no Void and no journal entry: a quote never posts.
export function quoteReadActions(
    status: DocumentStatus,
    canWrite: boolean,
    hasInvoice: boolean
): DocumentReadAction[] {
    const actions: DocumentReadAction[] = []
    if (status === 'closed' && hasInvoice) actions.push('invoice')
    if (canWrite && sendOffered('estimate', status)) actions.push('send')
    if (canWrite) actions.push('copy')
    actions.push('pdf')
    return actions
}
