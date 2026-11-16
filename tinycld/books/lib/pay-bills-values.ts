// The Pay Bills form's values (spec §3.2–§3.5). Field names are the server's, so a refusal
// keyed by one lands under its field. The filters and the sort are screen state
// (hooks/usePayBillsForm.ts), not form values.

import type { BooksBillPaymentLines, BooksBillPayments } from '../types'
import { centsToText } from './money-text'
import type { PayBillsRow } from './pay-bills-rows'
import type { PaymentMethodKey } from './payment-methods'
import type { PaymentEntry } from './payment-values'

export type PayBillsFormValues = {
    paid_from: string
    date: string
    payment_method: PaymentMethodKey | ''
    // Starting check no. on a new screen; Check no. on `?replaces`.
    reference_no: string
    // By bill id; a row with no entry is at zero. An entry's `number` is the bill number.
    payments: Record<string, PaymentEntry>
}

/**
 * A new Pay Bills screen: the given Paid from and its method, today, no check number, and
 * with `?bill=` that bill paid for its open balance (when it is listed and open).
 */
export function newPayBillsValues(input: {
    paidFrom: string
    method: PaymentMethodKey | ''
    today: string
    billId: string | null
    rows: readonly PayBillsRow[]
}): PayBillsFormValues {
    const bill = input.billId === null ? undefined : input.rows.find(row => row.id === input.billId)
    const payments: Record<string, PaymentEntry> =
        bill && bill.open > 0
            ? {
                  [bill.id]: {
                      amount: centsToText(bill.open),
                      open: bill.open,
                      number: bill.number,
                  },
              }
            : {}
    return {
        paid_from: input.paidFrom,
        date: input.today,
        payment_method: input.method,
        reference_no: '',
        payments,
    }
}

/**
 * The Ref no. a correction is saved with (spec §3.2: the field is Check no. only while the
 * method is Check). Check saves the typed Check no.; another method saves the original's
 * Ref no. when the original was not a check either, and none when it was, so a Check no.
 * hidden by the method change is not stored where the user cannot see or clear it.
 */
export function correctionReferenceNo(input: {
    method: PaymentMethodKey | ''
    typed: string
    original: Pick<BooksBillPayments, 'payment_method' | 'reference_no'>
}): string {
    if (input.method === 'check') return input.typed
    if (input.original.payment_method === 'check') return ''
    return input.original.reference_no
}

/**
 * A correction (`?replaces=<id>`, spec §3.6) starts from its posted original: its Paid
 * from, date, method and own Ref no. (Check no.), and each of its lines paid for the
 * line's amount. `rows` is the merged list (hooks/useOpenBills.ts through
 * mergeOutstanding), whose `open` already holds the bill's balance plus what the original
 * paid on it, so the line amount is not added again. A line whose bill is not listed
 * cannot be shown, so it is left out.
 */
export function correctionPayBillsValues(input: {
    payment: Pick<BooksBillPayments, 'paid_from' | 'date' | 'payment_method' | 'reference_no'>
    lines: readonly Pick<BooksBillPaymentLines, 'bill' | 'amount'>[]
    rows: readonly PayBillsRow[]
}): PayBillsFormValues {
    const rowsById = new Map(input.rows.map(row => [row.id, row]))
    const payments: Record<string, PaymentEntry> = {}
    for (const line of input.lines) {
        const row = rowsById.get(line.bill)
        if (!row) continue
        payments[line.bill] = {
            amount: centsToText(line.amount),
            open: row.open,
            number: row.number,
        }
    }
    return {
        paid_from: input.payment.paid_from,
        date: input.payment.date.slice(0, 10),
        payment_method: input.payment.payment_method,
        reference_no: input.payment.reference_no,
        payments,
    }
}
