// The pure rules of the customer's estimate page (spec §3.2, §3.4): which state a row
// shows, and every text the page draws from it.

import type { BooksEstimatePublic } from '../types'
import { formatDay } from './register-range'

export type PublicEstimateRow = BooksEstimatePublic

export type PublicOutcome = 'decide' | 'accepted' | 'declined' | 'closed' | 'expired'

export const PUBLIC_TEXTS = {
    loading: 'Loading estimate…',
    notFound: 'This link is not valid.',
    notFoundHint: 'Ask the business that sent it for a new link.',
    loadError: 'The estimate could not load.',
    retry: 'Try again',
    totalLabel: 'Estimate total',
    downloadPdf: 'Download PDF',
    loadingTitle: 'Estimate',
    accept: 'Accept',
    decline: 'Decline',
    nameLabel: 'Your name',
    acceptConfirm: 'Accept estimate',
    accepting: 'Accepting…',
    reasonLabel: 'Reason (optional)',
    declineConfirm: 'Decline estimate',
    declining: 'Declining…',
    back: 'Back',
} as const

export function decideTextOf(business: string): string {
    return `To move forward, select Accept and ${business} will reach out with next steps.`
}

export function declineQuestionOf(business: string): string {
    return `Decline this estimate? ${business} will see that you declined.`
}

// Expiry stops only a pending estimate; the day of expiry itself still decides. Days are
// ISO strings, so they compare as text.
export function publicOutcomeOf(
    row: Pick<PublicEstimateRow, 'status' | 'expiration_date'>,
    today: string
): PublicOutcome {
    if (row.status === 'accepted') return 'accepted'
    if (row.status === 'rejected') return 'declined'
    if (row.status === 'closed') return 'closed'
    if (row.expiration_date !== '' && row.expiration_date < today) return 'expired'
    return 'decide'
}

export function businessNameOf(
    row: Pick<PublicEstimateRow, 'business_name'>,
    deploymentName: string
): string {
    const name = row.business_name.trim()
    return name === '' ? deploymentName : name
}

export function publicTitleOf(number: string, business: string): string {
    return `Estimate ${number} · ${business}`
}

export function publicHeadingOf(row: Pick<PublicEstimateRow, 'number' | 'customer_name'>): string {
    return `Estimate ${row.number} for ${row.customer_name}`
}

export function publicDatesOf(row: Pick<PublicEstimateRow, 'date' | 'expiration_date'>): string {
    const date = `Estimate date ${formatDay(row.date)}`
    if (row.expiration_date === '') return date
    return `${date} · Expires ${formatDay(row.expiration_date)}`
}

export function contactOf(
    row: Pick<PublicEstimateRow, 'business_email' | 'business_phone'>
): { email: string; phone: string } | null {
    const email = row.business_email.trim()
    const phone = row.business_phone.trim()
    if (email === '' && phone === '') return null
    return { email, phone }
}

export function contactLeadOf(business: string): string {
    return `Questions? Contact ${business}`
}

// The lines of an outcome with no decision left (spec §3.4); 'decide' has none.
export function outcomeTextOf(
    outcome: PublicOutcome,
    row: Pick<PublicEstimateRow, 'accepted_by' | 'accepted_date' | 'expiration_date'>,
    business: string
): string[] {
    if (outcome === 'accepted') {
        const on = `You accepted this estimate on ${formatDay(row.accepted_date)}.`
        if (row.accepted_by === '') return [on]
        return [on, `Accepted by ${row.accepted_by}.`]
    }
    if (outcome === 'declined') return ['You declined this estimate.']
    if (outcome === 'closed') return [`${business} has turned this estimate into an invoice.`]
    if (outcome === 'expired') {
        const day = formatDay(row.expiration_date)
        return [`This estimate expired on ${day}. Contact ${business} for a new one.`]
    }
    return []
}
