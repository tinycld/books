// The rows a vendor credit's read view draws after Total (vendor credit spec §3.5, vendor
// refund spec §3.9): on a posted credit, Applied (with a minus sign; only when part of the
// total is applied to bills), Refunded (with a minus sign; only when a posted vendor refund
// names the credit) and Unapplied credit (the stored balance, the last row). The form, a
// draft and a void credit draw none. `refunded` is the cents of the posted refunds' lines
// on the credit; Applied is the total less the stored balance less `refunded`, so no
// applications read is needed. Pure.

import type { DocumentTotalRow } from './document-total-rows'
import { formatMoney, MINUS } from './money'

// The cents of a vendor credit applied to bills: what is used of it less what is refunded.
export function vendorCreditAppliedToBills(
    record: { total: number; balance: number },
    refunded: number
): number {
    return record.total - record.balance - refunded
}

export function vendorCreditReadTotals(
    record: {
        status: string
        total: number
        balance: number
        currency: string
    },
    refunded: number
): DocumentTotalRow[] {
    if (record.status !== 'posted') return []
    const applied = vendorCreditAppliedToBills(record, refunded)
    const rows: DocumentTotalRow[] = []
    if (applied > 0) {
        rows.push({
            label: 'Applied',
            amount: `${MINUS}${formatMoney(applied, record.currency)}`,
            testId: 'vendor-credit-total-applied',
        })
    }
    if (refunded > 0) {
        rows.push({
            label: 'Refunded',
            amount: `${MINUS}${formatMoney(refunded, record.currency)}`,
            testId: 'vendor-credit-refunded',
        })
    }
    rows.push({
        label: 'Unapplied credit',
        amount: formatMoney(record.balance, record.currency),
        testId: 'vendor-credit-total-unapplied',
        isStrong: true,
    })
    return rows
}
