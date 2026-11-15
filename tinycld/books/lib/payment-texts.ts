// The texts of the receive-payment screen (spec §3), and the header's big figure.

import { formatMoney, TOO_LARGE_TEXT } from './money'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney } from './money-text'

// `%s` is a customer's name, an invoice number or a money text; fillPaymentText fills it.
export const PAYMENT_MESSAGES = {
    // The form's rules (lib/payment-schema.ts).
    customerRequired: 'Choose a customer',
    // The day text of the sales documents (server/sales_documents.go msgDocumentDay).
    dateInvalid: 'Enter a date that exists',
    referenceTooLong: 'Reference no. can be at most 40 characters',
    // The sales receipt's text (SALES_RECEIPT_MESSAGES.depositInvalid).
    depositInvalid: 'Choose an active bank or Undeposited funds account',
    amountRequired: 'Enter the amount received',
    amountTooLarge: 'The amount is more than Books can store',
    // The Books text for money that does not parse (ACCOUNT_AMOUNT_MESSAGES.malformed).
    amountMalformed: 'Enter an amount like 1,234.50',
    rowNegative: 'Enter a payment of 0 or more',
    rowOverOpen: 'More than the open balance of %s',
    // The first `%s` is the sum of the row payments, the second Amount received.
    sumOverAmount: 'The payments add up to %s, more than the %s received',
    // The sales documents' text (DOCUMENT_NOTE_TOO_LONG.memo).
    memoTooLong: 'The internal memo is too long',

    // The outstanding list.
    chooseCustomer: 'Choose a customer to see their open invoices.',
    noOpenInvoices: '%s has no open invoices. The amount you enter is kept as a credit.',
    keptAsCredit: 'Kept as a credit for %s',
    listLoadFailed: 'Books could not load the open invoices.',
    findMiss: 'No open invoice %s',
    findFailed: 'Books could not look up invoice %s. Try again.',
    customerInactive: '%s is inactive. Choose an active customer.',

    // Deposit to's option when the chart has no active Undeposited funds account.
    createdOnPost: 'Undeposited funds (created when you post)',

    // The screen's states.
    noAccess: 'You need bookkeeper access to receive payments',
    loadFailed: 'Books could not load this payment.',
    notFound: 'This payment does not exist',
    cannotEdit: 'This payment cannot be edited',
    voidBody:
        'A reversing entry is posted in the original period. The number is kept. The invoices it paid are open again.',
} as const

// A message with each `%s` filled in order. A replacer function, so a `$&` in a typed
// name stays as typed.
export function fillPaymentText(template: string, ...values: string[]): string {
    let index = 0
    return template.replace(/%s/g, () => values[index++] ?? '')
}

const NO_AMOUNT = '—'

// The header's big figure, "Amount received": the amount as money, a dash while it is
// empty or does not parse, "Too large" for well-formed text above what Books can store.
export function paymentFigureText(amount: string, currency: string): string {
    if (amount.trim() === '') return NO_AMOUNT
    const cents = moneyInputCents(amount, currency)
    if (cents !== null) return formatMoney(cents, currency)
    return isWellFormedMoney(amount, currency) ? TOO_LARGE_TEXT : NO_AMOUNT
}
