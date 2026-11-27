// What a sales document's status means in its kind's lifecycle (spec §3.1). The posting
// kinds (invoice, sales receipt) run draft → posted → void; a quote (estimate) runs
// pending / accepted / rejected → closed and never posts. Every shared file of the
// document layer asks this module instead of naming statuses. Pure, so each rule is
// unit-tested.

import type {
    BooksEstimates,
    BooksInvoices,
    BooksJournalEntries,
    BooksPurchaseOrders,
} from '../types'
import type { DocumentReadAction } from './document-actions'
import { sendOffered } from './document-send'
import { entryStatusText } from './entry-display'
import { estimateStatusLabel } from './estimate-status'
import { formatMoney } from './money'
import type { DocumentLifecycle } from './sales-document-kinds'

export type DocumentStatus =
    | BooksInvoices['status']
    | BooksEstimates['status']
    | BooksPurchaseOrders['status']

export type PostingStatus = BooksJournalEntries['status']

export type OrderStatus = BooksPurchaseOrders['status']

function isPostingStatus(status: DocumentStatus): status is PostingStatus {
    return status === 'draft' || status === 'posted' || status === 'void'
}

// A writer edits the document in the form: a posting draft, an open quote, an open order
// (the order's form opens with Edit, `?edit=1`: lib/document-screen-state.ts).
export function isFormStatus(lifecycle: DocumentLifecycle, status: DocumentStatus): boolean {
    switch (lifecycle) {
        case 'posting':
            return status === 'draft'
        case 'quote':
            return status === 'pending' || status === 'accepted' || status === 'rejected'
        case 'order':
            return status === 'open'
    }
}

// The document opens in the read view for everyone and is never edited: posted or void, a
// closed quote, a closed order.
export function isReadOnlyStatus(lifecycle: DocumentLifecycle, status: DocumentStatus): boolean {
    switch (lifecycle) {
        case 'posting':
            return status === 'posted' || status === 'void'
        case 'quote':
        case 'order':
            return status === 'closed'
    }
}

// A posting kind deletes only a draft; a quote may be deleted until an invoice closes it;
// an order while it is open (the server refuses one that a bill names).
export function canDeleteStatus(lifecycle: DocumentLifecycle, status: DocumentStatus): boolean {
    switch (lifecycle) {
        case 'posting':
            return status === 'draft'
        case 'quote':
            return status !== 'closed'
        case 'order':
            return status === 'open'
    }
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

// An order's badge words and tones (purchase order spec §3.6). "Partly received" is the
// read view's own badge over Open (lib/purchase-order-status.ts purchaseOrderBadge).
const ORDER_BADGES: Record<OrderStatus, { label: string; tone: StatusTone }> = {
    open: { label: 'Open', tone: 'info' },
    closed: { label: 'Closed', tone: 'muted' },
}

function isOrderStatus(status: DocumentStatus): status is OrderStatus {
    return Object.hasOwn(ORDER_BADGES, status)
}

// A document status as a quote's, or undefined for a status a quote does not have.
export function quoteStatusOf(
    status: DocumentStatus | undefined
): BooksEstimates['status'] | undefined {
    return status !== undefined && isQuoteStatus(status) ? status : undefined
}

// The badge of a status (spec §7): the posting kinds keep the words and tones of the
// entry badges; a quote's are Pending info, Accepted success, Rejected destructive and
// Closed muted; an order's Open info and Closed muted. null for a status the lifecycle
// does not have.
export function statusBadgeOf(
    lifecycle: DocumentLifecycle,
    status: DocumentStatus
): { label: string; tone: StatusTone } | null {
    switch (lifecycle) {
        case 'posting':
            if (!isPostingStatus(status)) return null
            return { label: entryStatusText(status), tone: POSTING_TONES[status] }
        case 'quote':
            if (!isQuoteStatus(status)) return null
            return { label: estimateStatusLabel(status), tone: QUOTE_TONES[status] }
        case 'order':
            if (!isOrderStatus(status)) return null
            return ORDER_BADGES[status]
    }
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

// The read view's actions of a purchase order (purchase order spec §3.6), in the spec's
// order. A writer on an open order: Copy to bill (while a line is open, `hasOpenLine`:
// orderHasOpenLine), Edit, Send…, Copy, Download PDF and Delete (a More row); a Books
// admin also Close. A writer on a closed order: Copy and Download PDF; an admin also Reopen
// on an order closed by hand (one closed as received opens again from its bills). A
// reader: Download PDF.
export function orderReadActions(input: {
    status: OrderStatus
    closedReason: BooksPurchaseOrders['closed_reason']
    canWrite: boolean
    isAdmin: boolean
    hasOpenLine: boolean
}): DocumentReadAction[] {
    const { status, closedReason, canWrite, isAdmin, hasOpenLine } = input
    if (!canWrite) return ['pdf']
    if (status === 'open') {
        const copyToBill: DocumentReadAction[] = hasOpenLine ? ['copy_to_bill'] : []
        const close: DocumentReadAction[] = isAdmin ? ['close'] : []
        return [...copyToBill, 'edit', 'send', 'copy', 'pdf', 'delete', ...close]
    }
    const reopen: DocumentReadAction[] = isAdmin && closedReason === 'manual' ? ['reopen'] : []
    return ['copy', 'pdf', ...reopen]
}

// The Close confirm's body (purchase order spec §3.6, Q6): how many lines are still open
// (`isOrderLineOpen`) and the order's open amount, in the shared money text.
export function orderCloseBody(openLines: number, openAmount: number, currency: string): string {
    const lines = openLines === 1 ? '1 line is' : `${openLines} lines are`
    const amount = formatMoney(openAmount, currency)
    return `${lines} still open (${amount}). Nothing more can be copied to a bill.`
}
