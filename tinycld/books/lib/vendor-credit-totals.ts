// The rows a vendor credit's read view draws after Total (vendor credit spec §3.5): on a
// posted credit, Applied (with a minus sign; only when part of the total is applied) and
// Unapplied credit (the stored balance, the last row). The form, a draft and a void credit
// draw none. Applied is the total less the stored balance, so no applications read is
// needed. Pure.

import type { DocumentTotalRow } from '../components/documents/DocumentTotalsPanel'
import { formatMoney } from './money'

// U+2212, not the ASCII hyphen formatMoney writes for a negative amount.
const MINUS = '−'

export function vendorCreditReadTotals(record: {
    status: string
    total: number
    balance: number
    currency: string
}): DocumentTotalRow[] {
    if (record.status !== 'posted') return []
    const applied = record.total - record.balance
    const unapplied: DocumentTotalRow = {
        label: 'Unapplied credit',
        amount: formatMoney(record.balance, record.currency),
        testId: 'vendor-credit-total-unapplied',
        isStrong: true,
    }
    if (applied <= 0) return [unapplied]
    const appliedRow: DocumentTotalRow = {
        label: 'Applied',
        amount: `${MINUS}${formatMoney(applied, record.currency)}`,
        testId: 'vendor-credit-total-applied',
    }
    return [appliedRow, unapplied]
}
