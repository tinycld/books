// Why a customer is exempt from sales tax: the keys of books_customers'
// exemption_reason select (migration 2100000007), in the order the Exemption
// reason select lists them. tests/exemption-reasons.test.ts fails when these
// keys drift from the migration's values.

import type { BooksCustomers } from '../types'

export type ExemptionReasonKey = Exclude<BooksCustomers['exemption_reason'], ''>

export const EXEMPTION_REASONS = [
    { key: 'resale', label: 'Resale' },
    { key: 'federal_government', label: 'Federal government' },
    { key: 'state_local_government', label: 'State or local government' },
    { key: 'tribal_government', label: 'Tribal government' },
    { key: 'nonprofit', label: 'Nonprofit organization' },
    { key: 'educational', label: 'Educational organization' },
    { key: 'agricultural', label: 'Agricultural' },
    { key: 'manufacturing', label: 'Manufacturing' },
    { key: 'direct_pay', label: 'Direct pay permit' },
    { key: 'other', label: 'Other' },
] as const satisfies readonly { key: ExemptionReasonKey; label: string }[]

// A tuple literal, so `z.enum(EXEMPTION_REASON_KEYS)` types the ten keys.
export const EXEMPTION_REASON_KEYS = [
    'resale',
    'federal_government',
    'state_local_government',
    'tribal_government',
    'nonprofit',
    'educational',
    'agricultural',
    'manufacturing',
    'direct_pay',
    'other',
] as const satisfies readonly ExemptionReasonKey[]

export function exemptionReasonOptions(): { value: ExemptionReasonKey | ''; label: string }[] {
    return [
        { value: '', label: 'Choose…' },
        ...EXEMPTION_REASONS.map(reason => ({ value: reason.key, label: reason.label })),
    ]
}
