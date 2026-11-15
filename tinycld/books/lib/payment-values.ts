// The receive-payment form's values: the start values of a new payment and of a saved
// draft, and the application rows a save writes (spec §3.4, §3.6).

import { newRecordId } from 'pbtsdb/core'
import type { BooksPaymentApplications, BooksPayments } from '../types'
import { moneyInputText } from './money-input'
import { centsToText, parseMoney } from './money-text'
import type { OutstandingRow } from './payment-allocation'
import type { PaymentMethodKey } from './payment-methods'

// A row's typed payment, with its open balance and invoice number, so the schema checks
// a row without reading the list.
export type PaymentEntry = { amount: string; open: number; number: string }

// Field names are the server's, so a refusal keyed by one lands under its field.
// `amountTyped` is form state only: whether the user typed Amount received (spec §3.4).
export type PaymentFormValues = {
    customer: string
    date: string
    payment_method: PaymentMethodKey | ''
    reference_no: string
    deposit_to: string
    amount: string
    amountTyped: boolean
    // By invoice id; a row with no entry is at zero.
    payments: Record<string, PaymentEntry>
    memo: string
}

// A new payment. `?invoice=` (with `?customer=`) ticks that invoice for its open balance,
// and Amount received follows it.
export function newPaymentValues(input: {
    today: string
    customer: string
    invoice: OutstandingRow | null
    depositTo: string
}): PaymentFormValues {
    const invoice =
        input.customer !== '' && input.invoice && input.invoice.open > 0 ? input.invoice : null
    const payments: Record<string, PaymentEntry> = invoice
        ? {
              [invoice.id]: {
                  amount: centsToText(invoice.open),
                  open: invoice.open,
                  number: invoice.number,
              },
          }
        : {}
    return {
        customer: input.customer,
        date: input.today,
        payment_method: '',
        reference_no: '',
        deposit_to: input.depositTo,
        amount: invoice ? centsToText(invoice.open) : '',
        amountTyped: false,
        payments,
        memo: '',
    }
}

type DraftPayment = Pick<
    BooksPayments,
    'customer' | 'date' | 'payment_method' | 'reference_no' | 'deposit_to' | 'amount' | 'memo'
>

// A stored application as the form reads it: its invoice's number and open balance.
type DraftApplication = Pick<BooksPaymentApplications, 'invoice' | 'amount'> & {
    open: number
    number: string
}

// A saved draft (or a correction's original). The stored amounts are kept as their text.
// Amount received counts as typed only when it differs from the applications' sum: the
// user typed an amount that left a credit. Otherwise it follows the rows again.
export function draftPaymentValues(
    payment: DraftPayment,
    applications: readonly DraftApplication[]
): PaymentFormValues {
    const payments: Record<string, PaymentEntry> = {}
    let applied = 0
    for (const application of applications) {
        applied += application.amount
        payments[application.invoice] = {
            amount: moneyInputText(application.amount),
            open: application.open,
            number: application.number,
        }
    }
    return {
        customer: payment.customer,
        date: payment.date.slice(0, 10),
        payment_method: payment.payment_method,
        reference_no: payment.reference_no,
        deposit_to: payment.deposit_to,
        amount: moneyInputText(payment.amount),
        amountTyped: payment.amount !== applied,
        payments,
        memo: payment.memo,
    }
}

export type PaymentWriteRow = { id: string; invoice: string; amount: number }

/**
 * The applications a save stores: one per row with a payment above zero, in cents. A
 * stored application keeps its id while its invoice is still paid; a new one gets a fresh
 * id. `order` is the list's invoice ids (oldest due first): the rows come in that order,
 * so `position` follows the list; an invoice the list does not name comes last. The
 * schema has checked every amount in the Books currency, so the text parses here.
 */
export function paymentWriteRows(
    values: Pick<PaymentFormValues, 'payments'>,
    stored: readonly { id: string; invoice: string }[],
    order: readonly string[] = []
): PaymentWriteRow[] {
    const storedIds = new Map(stored.map(row => [row.invoice, row.id]))
    const place = (invoice: string) => {
        const index = order.indexOf(invoice)
        return index === -1 ? order.length : index
    }
    return Object.entries(values.payments)
        .map(([invoice, entry]) => ({ invoice, cents: parseMoney(entry.amount) ?? 0 }))
        .filter(row => row.cents > 0)
        .sort((a, b) => place(a.invoice) - place(b.invoice))
        .map(row => ({
            id: storedIds.get(row.invoice) ?? newRecordId(),
            invoice: row.invoice,
            amount: row.cents,
        }))
}
