// The Pay Bills form's values (spec §3.2–§3.5). Field names are the server's, so a refusal
// keyed by one lands under its field. The filters and the sort are screen state
// (hooks/usePayBillsForm.ts), not form values.

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
