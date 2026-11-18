// A payment form's values: the start values of a new payment, a saved draft and a
// correction, and the line rows a save writes (receive-payment spec §3.4, §3.6). The form
// names the party and the account by role (`party`, `account`) and a row's document
// `document`, so one form serves every payment flow (vendor refund spec §3.1); each flow
// maps them to its server fields (lib/payment-flow.ts `serverFields`).

import { newRecordId } from 'pbtsdb/core'
import type { BooksPaymentApplications, BooksPayments } from '../types'
import { moneyInputText } from './money-input'
import { centsToText, parseMoney } from './money-text'
import type { OutstandingRow } from './payment-allocation'
import type { PaymentMethodKey } from './payment-methods'

// A row's typed payment, with its open amount and document number, so the schema checks
// a row without reading the list.
export type PaymentEntry = { amount: string; open: number; number: string }

// `amountTyped` is form state only: whether the user typed the amount (spec §3.4).
export type PaymentFormValues = {
    party: string
    date: string
    payment_method: PaymentMethodKey | ''
    reference_no: string
    account: string
    amount: string
    amountTyped: boolean
    // By document id; a row with no entry is at zero.
    payments: Record<string, PaymentEntry>
    memo: string
}

// A new payment. A start document (`?invoice=` with `?customer=`, `?credit=` with
// `?vendor=`) is ticked for its open amount, and the amount follows it.
export function newPaymentValues(input: {
    today: string
    party: string
    document: OutstandingRow | null
    account: string
}): PaymentFormValues {
    const document =
        input.party !== '' && input.document && input.document.open > 0 ? input.document : null
    const payments: Record<string, PaymentEntry> = document
        ? {
              [document.id]: {
                  amount: centsToText(document.open),
                  open: document.open,
                  number: document.number,
              },
          }
        : {}
    return {
        party: input.party,
        date: input.today,
        payment_method: '',
        reference_no: '',
        account: input.account,
        amount: document ? centsToText(document.open) : '',
        amountTyped: false,
        payments,
        memo: '',
    }
}

// A stored header as the form reads it, its party and account by role. The payment
// method's keys and the money fields are those every payment collection shares.
type DraftPayment = Pick<
    BooksPayments,
    'date' | 'payment_method' | 'reference_no' | 'amount' | 'memo'
> & { party: string; account: string }

// A stored line as the form reads it: its document's number and open amount.
type DraftApplication = Pick<BooksPaymentApplications, 'amount'> & {
    document: string
    open: number
    number: string
}

// A saved draft (or a correction's original). The stored amounts are kept as their text.
// The amount counts as typed only when it differs from the lines' sum: the user typed an
// amount that left a credit. Otherwise it follows the rows again.
export function draftPaymentValues(
    payment: DraftPayment,
    applications: readonly DraftApplication[]
): PaymentFormValues {
    const payments: Record<string, PaymentEntry> = {}
    let applied = 0
    for (const application of applications) {
        applied += application.amount
        payments[application.document] = {
            amount: moneyInputText(application.amount),
            open: application.open,
            number: application.number,
        }
    }
    return {
        party: payment.party,
        date: payment.date.slice(0, 10),
        payment_method: payment.payment_method,
        reference_no: payment.reference_no,
        account: payment.account,
        amount: moneyInputText(payment.amount),
        amountTyped: payment.amount !== applied,
        payments,
        memo: payment.memo,
    }
}

// A line of a posted original as a correction reads it: `balance` is its document's
// stored balance, which the original's own line has already lowered.
type OriginalApplication = Pick<BooksPaymentApplications, 'amount'> & {
    document: string
    number: string
    balance: number
}

// A correction (`?replaces=<id>`) starts from its posted original: the original's header,
// and each of its lines with the open amount the correction may take, the document's
// balance plus what the original put on it (the correction releases that at posting).
// `amountTyped` follows the rule of draftPaymentValues.
export function correctionPaymentValues(
    original: DraftPayment,
    applications: readonly OriginalApplication[]
): PaymentFormValues {
    return draftPaymentValues(
        original,
        applications.map(application => ({
            document: application.document,
            amount: application.amount,
            open: application.balance + application.amount,
            number: application.number,
        }))
    )
}

export type PaymentWriteRow = { id: string; document: string; amount: number }

/**
 * The lines a save stores: one per row with a payment above zero, in cents. A stored line
 * keeps its id while its document is still paid; a new one gets a fresh id. `order` is
 * the list's document ids (in list order): the rows come in that order, so `position`
 * follows the list; a document the list does not name comes last. The schema has checked
 * every amount in the Books currency, so the text parses here.
 */
export function paymentWriteRows(
    values: Pick<PaymentFormValues, 'payments'>,
    stored: readonly { id: string; document: string }[],
    order: readonly string[] = []
): PaymentWriteRow[] {
    const storedIds = new Map(stored.map(row => [row.document, row.id]))
    const place = (document: string) => {
        const index = order.indexOf(document)
        return index === -1 ? order.length : index
    }
    return Object.entries(values.payments)
        .map(([document, entry]) => ({ document, cents: parseMoney(entry.amount) ?? 0 }))
        .filter(row => row.cents > 0)
        .sort((a, b) => place(a.document) - place(b.document))
        .map(row => ({
            id: storedIds.get(row.document) ?? newRecordId(),
            document: row.document,
            amount: row.cents,
        }))
}
