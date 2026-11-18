// One payment layer, two flows (vendor refund spec §3.1): the received payment and the
// vendor refund share the form, its save, the record read, the read view and the keys.
// A flow's descriptor names what differs: the party, the account, the open documents,
// the collections' field names, the routes, the texts, the test ids, the sum rule and the
// lines under the list. A descriptor holds values only; each flow's screen calls its own
// hooks.

import type { DocumentChrome } from '../components/documents/document-chrome'
import type { PaymentVerb } from './deposit-accounts'
import { formatMoney } from './money'
import {
    INVOICE_OUTSTANDING,
    type OutstandingDocument,
    outstandingTexts,
} from './outstanding-documents'
import { amountToCredit } from './payment-allocation'
import { PAYMENT_CHROME } from './payment-kind'
import { fillPaymentText, PAYMENT_MESSAGES } from './payment-texts'

// The test id suffixes that differ by flow; each id is `<flow.testId>-<suffix>`.
export type PaymentFlowIds = {
    party: string
    account: string
    accountBalance: string
    listPrompt: string
    listEmpty: string
    listLoading: string
    listError: string
    sumError: string
    // The note under a total line that has one (the credit the payment keeps).
    totalNote: string
    // The read view's memo text.
    memoText: string
}

// Every text the shared parts print that names the party, the document or the account.
export type PaymentFlowTexts = {
    newTitle: string
    draftTitle: string
    editTitle: (number: string) => string
    readTitle: (number: string) => string
    partyLabel: string
    partyPlaceholder: string
    partySearchPlaceholder: string
    partyEmpty: string
    dateLabel: string
    accountLabel: string
    amountLabel: string
    // The form's rules that name the party, the account or the amount.
    partyRequired: string
    accountInvalid: string
    amountRequired: string
    rowNegative: string
    // The list.
    listHeading: string
    listPrompt: string
    listLoadingLabel: string
    listLoadFailed: string
    noDocuments: (partyName: string) => string
    // The no-documents state's button; null where it draws none.
    noDocumentsLabel: string
    noDocumentsHref: ((partyId: string) => string) | null
    clearLabel: string
    // A row's refusals: above its open amount; dated after the form date (null where the
    // flow has no date rule).
    aboveOpen: (open: string) => string
    datedAfter: ((number: string) => string) | null
    // The sum refusals under the list: rows above the amount; rows below it (null where
    // the flow keeps what the rows leave, as a credit).
    rowsAbove: (sum: string, amount: string) => string
    rowsBelow: ((rest: string) => string) | null
    // The memo, on the form and the read view; '' draws no hint line.
    memoLabel: string
    memoHint: string
    // The screen's states.
    loadFailed: string
    notFound: string
    noAccess: string
    cannotEdit: string
    // The dialogs.
    deleteDraftBody: string
    voidBody: string
    voidConfirm: string
    // What the Void dialog's title names before the number: "Void payment 1004?".
    voidNoun: string
    // The three ⇧? descriptions that name the document.
    payAllDescription: string
    clearDescription: string
    toggleRowDescription: string
    // The read view: its list heading, the verb of its payment line, and whether it draws
    // the applied and credited totals.
    readListHeading: string
    paymentVerb: PaymentVerb
    hasAppliedTotal: boolean
}

// The band's field widths on a wide screen; a phone stacks them at full width.
export type PaymentBandWidths = {
    party: number
    date: number
    method: number
    reference: number
    account: number
    amount: number
}

export type PaymentTotalsInput = {
    // Amount received (refunded) in cents; null while it is empty or does not parse.
    amountCents: number | null
    rowsCents: number
    currency: string
}

// A line under the list. `id` is a test id suffix; `note` is a template whose `%s` the
// shared totals part fills with the party's name ('' draws no note).
export type PaymentTotalLine = {
    id: string
    label: string
    amount: string
    isStrong: boolean
    isDanger: boolean
    note: string
}

export interface PaymentFlow {
    key: 'payment' | 'vendor_refund'
    chrome: DocumentChrome
    testId: string
    logContext: string
    routeBase: string
    // The new route's query parameters of the party and of a document to tick.
    partyParam: 'customer' | 'vendor'
    documentParam: 'invoice' | 'credit'
    // Where the read view's party link goes (`<partyRoute>/<id>`).
    partyRoute: string
    doc: OutstandingDocument
    // 'credit': the rows may add up to less than the amount (the rest is kept as a
    // credit); 'exact': the rows must add up to the amount.
    sumRule: 'credit' | 'exact'
    // The server's key of a line refusal (`<lineKey>.<position>`).
    lineKey: 'applications' | 'lines'
    // The server's field names of the party and the account.
    serverFields: { party: string; account: string }
    ids: PaymentFlowIds
    texts: PaymentFlowTexts
    widths: PaymentBandWidths
    totals: (input: PaymentTotalsInput) => PaymentTotalLine[]
}

export type PaymentFlowKey = PaymentFlow['key']

// The sum rule's text under the list, shown live on the form and refused on submit: rows
// above the amount under both rules; rows below it only under the 'exact' rule. '' while
// the amount is empty or not above zero (the amount's own rule speaks then).
export function sumErrorOf(
    flow: Pick<PaymentFlow, 'sumRule' | 'texts'>,
    { amountCents, rowsCents, currency }: PaymentTotalsInput
): string {
    if (amountCents === null || amountCents <= 0) return ''
    const { texts } = flow
    if (rowsCents > amountCents) {
        return texts.rowsAbove(formatMoney(rowsCents, currency), formatMoney(amountCents, currency))
    }
    if (flow.sumRule !== 'exact' || rowsCents === amountCents || texts.rowsBelow === null) {
        return ''
    }
    return texts.rowsBelow(formatMoney(amountCents - rowsCents, currency))
}

// Amount to apply, and Amount to credit with its note when the payment keeps a credit
// (receive-payment spec §3.3).
function receivedPaymentTotals({
    amountCents,
    rowsCents,
    currency,
}: PaymentTotalsInput): PaymentTotalLine[] {
    const apply: PaymentTotalLine = {
        id: 'to-apply',
        label: 'Amount to apply',
        amount: formatMoney(rowsCents, currency),
        isStrong: false,
        isDanger: false,
        note: '',
    }
    const creditCents = amountToCredit(amountCents, rowsCents)
    if (creditCents <= 0) return [apply]
    const credit: PaymentTotalLine = {
        id: 'to-credit',
        label: 'Amount to credit',
        amount: formatMoney(creditCents, currency),
        isStrong: true,
        isDanger: false,
        note: PAYMENT_MESSAGES.keptAsCredit,
    }
    return [apply, credit]
}

export const PAYMENT_FLOW: PaymentFlow = {
    key: 'payment',
    chrome: PAYMENT_CHROME,
    testId: 'payment',
    logContext: 'books.payment',
    routeBase: 'books/payments',
    partyParam: 'customer',
    documentParam: 'invoice',
    partyRoute: 'books/customers',
    doc: INVOICE_OUTSTANDING,
    sumRule: 'credit',
    lineKey: 'applications',
    serverFields: { party: 'customer', account: 'deposit_to' },
    ids: {
        party: 'customer',
        account: 'deposit-to',
        // The received payment draws no account balance.
        accountBalance: 'deposit-to-balance',
        listPrompt: 'choose-customer',
        listEmpty: 'list-empty',
        listLoading: 'list-loading',
        listError: 'list-error',
        sumError: 'over',
        totalNote: 'credit-note',
        memoText: 'detail-memo',
    },
    texts: {
        newTitle: 'Receive payment',
        draftTitle: 'Draft payment',
        editTitle: number => `Edit payment ${number}`,
        readTitle: number => `Payment ${number}`,
        partyLabel: 'Customer',
        partyPlaceholder: PAYMENT_MESSAGES.customerRequired,
        partySearchPlaceholder: 'Search customers',
        partyEmpty: 'No active customer matches',
        dateLabel: 'Payment date',
        accountLabel: 'Deposit to',
        amountLabel: 'Amount received',
        partyRequired: PAYMENT_MESSAGES.customerRequired,
        accountInvalid: PAYMENT_MESSAGES.depositInvalid,
        amountRequired: PAYMENT_MESSAGES.amountRequired,
        rowNegative: PAYMENT_MESSAGES.rowNegative,
        listHeading: 'Outstanding invoices',
        listPrompt: PAYMENT_MESSAGES.chooseCustomer,
        listLoadingLabel: 'Loading open invoices',
        listLoadFailed: PAYMENT_MESSAGES.listLoadFailed,
        noDocuments: name => fillPaymentText(PAYMENT_MESSAGES.noOpenInvoices, name),
        noDocumentsLabel: '',
        noDocumentsHref: null,
        clearLabel: 'Clear payments',
        aboveOpen: open => fillPaymentText(PAYMENT_MESSAGES.rowOverOpen, open),
        datedAfter: null,
        rowsAbove: (sum, amount) => fillPaymentText(PAYMENT_MESSAGES.sumOverAmount, sum, amount),
        rowsBelow: null,
        memoLabel: 'Internal memo (not printed)',
        memoHint: '',
        loadFailed: PAYMENT_MESSAGES.loadFailed,
        notFound: PAYMENT_MESSAGES.notFound,
        noAccess: PAYMENT_MESSAGES.noAccess,
        cannotEdit: PAYMENT_MESSAGES.cannotEdit,
        deleteDraftBody: 'The draft payment is deleted. This cannot be undone.',
        voidBody: PAYMENT_MESSAGES.voidBody,
        voidConfirm: 'Void payment',
        voidNoun: 'payment',
        payAllDescription: 'Pay every listed invoice in full',
        clearDescription: 'Clear payments',
        toggleRowDescription: 'Pay this invoice in full, or clear it',
        readListHeading: outstandingTexts(INVOICE_OUTSTANDING).appliedHeading,
        paymentVerb: 'deposited to',
        hasAppliedTotal: true,
    },
    widths: { party: 320, date: 180, method: 180, reference: 220, account: 300, amount: 200 },
    totals: receivedPaymentTotals,
}
