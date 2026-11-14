import type { BooksEstimateResponses, BooksEstimates } from '../types'
import { localDayOf } from './opening-balances'
import { formatDay } from './register-range'

export type DeclineNote = { date: string; reason: string }

type ResponseRow = Pick<BooksEstimateResponses, 'decision' | 'reason' | 'created'>

// The customer's decline as Books shows it: only while the stored status is Rejected and
// the newest response is a decline (a writer who set Rejected by hand after an accept
// gets no note). The date is the response's day in the viewer's time zone; the reason
// is shown as the customer wrote it.
export function declineNoteOf(
    status: BooksEstimates['status'] | undefined,
    response: ResponseRow | undefined
): DeclineNote | null {
    if (status !== 'rejected' || response?.decision !== 'declined') return null
    const day = localDayOf(response.created)
    if (day === '') return null
    return { date: formatDay(day), reason: response.reason }
}
