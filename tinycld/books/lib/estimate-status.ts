import type { BooksEstimates } from '../types'

type EstimateStatus = BooksEstimates['status']
type ChosenStatus = Exclude<EstimateStatus, 'closed'>

export const ESTIMATE_STATUSES = [
    'pending',
    'accepted',
    'rejected',
    'closed',
] as const satisfies readonly EstimateStatus[]

const LABELS: Record<EstimateStatus, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Rejected',
    closed: 'Closed',
}

// Only the server closes an estimate (when an invoice is made from it), so the
// status select never offers Closed.
export const ESTIMATE_STATUS_OPTIONS: { value: ChosenStatus; label: string }[] = [
    { value: 'pending', label: LABELS.pending },
    { value: 'accepted', label: LABELS.accepted },
    { value: 'rejected', label: LABELS.rejected },
]

function isEstimateStatus(status: string): status is EstimateStatus {
    return (ESTIMATE_STATUSES as readonly string[]).includes(status)
}

export function estimateStatusLabel(status: string): string {
    return isEstimateStatus(status) ? LABELS[status] : status
}

// Expired is a display only: a Pending or Accepted estimate whose expiration
// date is before today. Days are YYYY-MM-DD text, so they compare as strings.
export function isExpired(
    estimate: { status: string; expiration_date: string },
    today: string
): boolean {
    const open = estimate.status === 'pending' || estimate.status === 'accepted'
    return open && estimate.expiration_date !== '' && estimate.expiration_date < today
}

// Accepted by and Accepted date show only while the status is Accepted.
export function acceptanceShown(status: string): boolean {
    return status === 'accepted'
}
