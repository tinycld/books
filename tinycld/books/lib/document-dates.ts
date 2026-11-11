// Day arithmetic for documents. Days are YYYY-MM-DD text with no time zone, so the
// math runs in UTC: a local Date would move a day across a daylight-saving change.

import { PAYMENT_TERMS, type PaymentTermKey } from './payment-terms'
import { isIsoDay } from './register-range'

const MS_PER_DAY = 86_400_000

// The ISO day `days` calendar days after `day` (before it when negative); null when
// `day` is not an ISO day, as while the user is still typing it.
export function addDays(day: string, days: number): string | null {
    if (!isIsoDay(day)) return null
    const [year, month, date] = day.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, date) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

// The due date of a document dated `date` with `terms`; null for no terms, which
// leaves the due date as it is, and for a date that is not an ISO day.
export function dueDateFor(date: string, terms: PaymentTermKey): string | null {
    const term = PAYMENT_TERMS.find(row => row.key === terms)
    return term ? addDays(date, term.days) : null
}
