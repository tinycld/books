// The apply dialog's one zod schema and its pure helpers (apply credit spec §3.2–§3.4, plan
// decision 3), shared by its three uses: vendor credit → bills and credit memo → invoices
// (`from: 'credit'`, the credit fixed, the documents the rows) and invoice ← credit memos
// (`from: 'document'`, the invoice fixed, the credits the rows). The Apply date reports
// under `date`; each row's rule under its Credit to apply cell (`payments.<row id>.amount`);
// the sum against the fixed side and "at least one" at the root (the dialog's error
// summary). Every text comes from the kind's texts of the side (lib/credit-application-
// kinds.ts). Pure: every amount is integer cents through the shared money helpers.

import { z } from '@tinycld/core/ui/form'
import type { ApplyCreditTexts, ApplySideTexts } from './credit-application-kinds'
import { formatMoney } from './money'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney } from './money-text'
import { closedThroughMessage } from './opening-balances-messages'
import { compareNumbers, compareText } from './pay-bills-rows'
import { type OutstandingRow, type Payments, spreadAmount } from './payment-allocation'
import { fillPaymentText, PAYMENT_MESSAGES } from './payment-texts'
import type { PaymentEntry } from './payment-values'
import { formatDay, isIsoDay } from './register-range'

// The vendor credit's texts before the dialog was shared; VENDOR_CREDIT_APPLICATION.texts
// takes these values. `%s` is a money text, a vendor's name or a bill number. The date, row
// and sum rules match the server's refusals of an application
// (server/vendor_credit_applications.go), which the dialog also shows.
export const APPLY_CREDIT_MESSAGES = {
    dateBeforeCredit: "The apply date can't be before the credit date.",
    // Receive payment's and Pay Bills' text for the same rule.
    rowOverOpen: PAYMENT_MESSAGES.rowOverOpen,
    overUnapplied: 'More than the unapplied credit of %s.',
    selectOne: 'Select at least one bill.',
    // Pay Bills' words for the same open-bills read.
    loadFailed: 'Books could not load the open bills.',
    noOpenBills:
        '%s has no open bills. The credit stays on the vendor until you post a bill or record a refund.',
    // The first `%s` is the bill's number, the second the amount the credit gives back.
    removeBody:
        "Remove this credit from Bill %s? The bill's balance goes up by %s and the credit is unapplied again.",
} as const

export type ApplyFrom = 'credit' | 'document'

// A listed row: an open document (from a credit), or a credit (from a document), where
// `open` is the credit's unapplied amount and `creditDate` its date.
export type ApplyRow = OutstandingRow & { creditDate?: string }

export type ApplyCreditValues = { date: string; payments: Payments }

export type ApplyCreditSchemaInput = {
    texts: ApplyCreditTexts
    from: ApplyFrom
    // The fixed credit's date (`from: 'credit'`): the apply date is never before it. '' from
    // a document, where each ticked row's `creditDate` counts instead.
    creditDate: string
    // The settings' close date ('' with none): the apply date is after it, unless the user
    // holds an unexpired close-date override (`hasOverride`).
    closeDate: string
    hasOverride: boolean
    // The fixed side's amount (the credit's unapplied credit, or the invoice's open
    // balance): the rows together take at most this.
    fixedCents: number
    // The listed rows: a row takes at most its `open`.
    rows: readonly ApplyRow[]
    currency: string
}

// The texts of the side the dialog applies from. A kind with no document side (the vendor
// credit) is only applied from the credit.
export function applySideTexts(texts: ApplyCreditTexts, from: ApplyFrom): ApplySideTexts {
    if (from === 'document' && texts.document !== null) return texts.document
    return texts.credit
}

// The listed rows with an amount above zero (the ones the write applies).
function tickedRows(input: ApplyCreditSchemaInput, payments: Payments): ApplyRow[] {
    return input.rows.filter(
        row => (moneyInputCents(payments[row.id]?.amount ?? '', input.currency) ?? 0) > 0
    )
}

// From a document: the ticked credit with the latest credit date after `date`, or null.
function laterCredit(date: string, ticked: readonly ApplyRow[]): ApplyRow | null {
    let latest: ApplyRow | null = null
    for (const row of ticked) {
        const creditDate = row.creditDate ?? ''
        if (creditDate <= date) continue
        if (latest === null || creditDate > (latest.creditDate ?? '')) latest = row
    }
    return latest
}

function dateMessage(
    date: string,
    input: ApplyCreditSchemaInput,
    side: ApplySideTexts,
    payments: Payments
): string | null {
    if (!isIsoDay(date)) return PAYMENT_MESSAGES.dateInvalid
    if (input.from === 'credit' && date < input.creditDate) return side.dateBeforeCredit
    if (input.from === 'document') {
        const later = laterCredit(date, tickedRows(input, payments))
        if (later !== null) {
            return fillPaymentText(
                side.dateBeforeCredit,
                later.number,
                formatDay(later.creditDate ?? '')
            )
        }
    }
    if (input.closeDate !== '' && date <= input.closeDate && !input.hasOverride) {
        return closedThroughMessage(input.closeDate)
    }
    return null
}

// A row's message, or null. `open` is the listed row's limit.
function rowMessage(
    entry: PaymentEntry,
    open: number,
    side: ApplySideTexts,
    currency: string
): string | null {
    const overLimit = fillPaymentText(side.rowOverLimit, formatMoney(open, currency))
    const cents = moneyInputCents(entry.amount, currency)
    if (cents === null) {
        return isWellFormedMoney(entry.amount, currency)
            ? overLimit
            : PAYMENT_MESSAGES.amountMalformed
    }
    if (cents < 0) return PAYMENT_MESSAGES.rowNegative
    return cents > open ? overLimit : null
}

const entrySchema = z.object({ amount: z.string(), open: z.number(), number: z.string() })

export function applyCreditSchema(
    input: ApplyCreditSchemaInput
): z.ZodType<ApplyCreditValues, ApplyCreditValues> {
    const openByRow = new Map(input.rows.map(row => [row.id, row.open]))
    const { currency } = input
    const side = applySideTexts(input.texts, input.from)
    return z
        .object({
            date: z.string(),
            payments: z.record(z.string(), entrySchema),
        })
        .superRefine((values, ctx) => {
            const dateIssue = dateMessage(values.date, input, side, values.payments)
            if (dateIssue !== null) {
                ctx.addIssue({ code: 'custom', path: ['date'], message: dateIssue })
            }
            let applied = 0
            let appliedRows = 0
            let rowsParse = true
            // Only the listed rows count: an entry of a row that left the list since the
            // dialog opened (paid, applied or voided elsewhere) is not shown and is not
            // applied.
            for (const [rowId, entry] of Object.entries(values.payments)) {
                const open = openByRow.get(rowId)
                if (open === undefined) continue
                const message = rowMessage(entry, open, side, currency)
                if (message !== null) {
                    ctx.addIssue({ code: 'custom', path: ['payments', rowId, 'amount'], message })
                }
                const cents = moneyInputCents(entry.amount, currency)
                if (cents === null || cents < 0) rowsParse = false
                else if (cents > 0) {
                    applied += cents
                    appliedRows += 1
                }
            }
            // A sum of half-typed amounts means nothing, so the root rules wait for every
            // row to parse.
            if (!rowsParse) return
            if (appliedRows === 0) {
                ctx.addIssue({ code: 'custom', path: ['root'], message: side.selectOne })
                return
            }
            if (applied > input.fixedCents) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['root'],
                    message: fillPaymentText(
                        side.sumOverFixed,
                        formatMoney(input.fixedCents, currency)
                    ),
                })
            }
        })
}

function rowsText(side: ApplySideTexts, count: number): string {
    return count === 1 ? side.rowsOne : fillPaymentText(side.rowsMany, String(count))
}

// The line under the list: "Applying $150.00 to 1 invoice · $100.00 stays unapplied", from
// an invoice "Applying $150.00 from 1 credit memo · $250.00 stays due".
export function applySummaryText(
    texts: ApplyCreditTexts,
    from: ApplyFrom,
    appliedCents: number,
    count: number,
    leftCents: number,
    currency: string
): string {
    const side = applySideTexts(texts, from)
    return fillPaymentText(
        side.summary,
        formatMoney(appliedCents, currency),
        rowsText(side, count),
        formatMoney(leftCents, currency)
    )
}

// The toast after the applications are written: "Applied $150.00 to 1 invoice", from an
// invoice "Applied $150.00 from 1 credit memo".
export function appliedToastText(
    texts: ApplyCreditTexts,
    from: ApplyFrom,
    appliedCents: number,
    count: number,
    currency: string
): string {
    const side = applySideTexts(texts, from)
    return fillPaymentText(side.toast, formatMoney(appliedCents, currency), rowsText(side, count))
}

// The Apply date the dialog opens with: today, or the latest of the credit dates when that
// is later (the date is never before a credit it applies). From a credit, its one date;
// from a document, the dates of the credits the spread ticked.
export function applyDefaultDate(today: string, creditDates: readonly string[]): string {
    return creditDates.reduce((latest, day) => (day > latest ? day : latest), today)
}

// From a document: the credits placed in list order, each up to its unapplied credit
// (`open`), together up to the document's open balance. The same rule as a credit spread
// over documents (spreadAmount).
export function spreadForDocument(rows: readonly ApplyRow[], openCents: number): Payments {
    return spreadAmount(rows, openCents)
}

// The list's order (a new array): the row `sourceId` names first (the invoice a credit memo
// was made from; '' for none), then by due date (a credit's row carries its credit date
// there), then by number.
export function sortApplyRows(rows: readonly ApplyRow[], sourceId: string): ApplyRow[] {
    const isSource = (row: ApplyRow) => (sourceId !== '' && row.id === sourceId ? 0 : 1)
    return [...rows].sort(
        (a, b) =>
            isSource(a) - isSource(b) ||
            compareText(a.due_date.slice(0, 10), b.due_date.slice(0, 10)) ||
            compareNumbers(a.number, b.number) ||
            compareText(a.id, b.id)
    )
}

// From an invoice (spec §3.3): the credit memos made from the invoice (`sourceIds`) first,
// then the rest, each part keeping the order of `rows` (sortApplyRows with no source).
export function sourceMemosFirst(
    rows: readonly ApplyRow[],
    sourceIds: ReadonlySet<string>
): ApplyRow[] {
    return [
        ...rows.filter(row => sourceIds.has(row.id)),
        ...rows.filter(row => !sourceIds.has(row.id)),
    ]
}

export type ApplyDialogBody = 'loading' | 'load-error' | 'empty' | 'rows'

// What the dialog's body draws, and whether Apply credit and the fields take input. A failed
// read wins over loading (its Retry shows); with no row the empty state shows. Apply credit
// needs rows, writes available (online) and no write held; the fields are disabled only while
// the write is held.
export function applyDialogState(input: {
    isLoading: boolean
    hasLoadError: boolean
    rowCount: number
    writesAvailable: boolean
    isHeld: boolean
}): { body: ApplyDialogBody; canSubmit: boolean; fieldsDisabled: boolean } {
    const body = applyDialogBody(input)
    return {
        body,
        canSubmit: body === 'rows' && input.writesAvailable && !input.isHeld,
        fieldsDisabled: input.isHeld,
    }
}

function applyDialogBody(input: {
    isLoading: boolean
    hasLoadError: boolean
    rowCount: number
}): ApplyDialogBody {
    if (input.hasLoadError) return 'load-error'
    if (input.isLoading) return 'loading'
    return input.rowCount === 0 ? 'empty' : 'rows'
}

const UNAPPLIED_PAYMENT_LINE =
    'Payment %s has %s that is not applied to an invoice. Open the payment and edit it to apply that amount.'
const MORE_PAYMENTS_ONE = "and 1 more payment on the customer's page"
const MORE_PAYMENTS_MANY = "and %s more payments on the customer's page"

// The invoice notice's payments line (apply credit spec §3.1, Q2): one line for each payment
// given, in the given order (useUnappliedPayments gives the oldest three), with the amount
// that is not applied (`credited`), and the link text for the rest (`moreCount`); '' when
// there is no more.
export function unappliedPaymentsText(
    payments: readonly { number: string; credited: number }[],
    moreCount: number,
    currency: string
): { lines: string[]; more: string } {
    const lines = payments.map(payment =>
        fillPaymentText(
            UNAPPLIED_PAYMENT_LINE,
            payment.number,
            formatMoney(payment.credited, currency)
        )
    )
    return { lines, more: morePaymentsText(moreCount) }
}

function morePaymentsText(count: number): string {
    if (count <= 0) return ''
    if (count === 1) return MORE_PAYMENTS_ONE
    return fillPaymentText(MORE_PAYMENTS_MANY, String(count))
}

const UNAPPLIED_CREDIT_LABEL = 'Credit memo %s · %s unapplied'

// One row of Receive payment's unapplied-credits notice (apply credit spec §3.8): the credit
// memo's number and its unapplied credit (`balance`, in cents).
export function unappliedCreditLabel(number: string, cents: number, currency: string): string {
    return fillPaymentText(UNAPPLIED_CREDIT_LABEL, number, formatMoney(cents, currency))
}

// The server's refusal keys that name one insert's document or credit (plan decision 7).
const ROW_REFUSAL_KEYS = new Set(['invoice', 'bill', 'credit_memo', 'vendor_credit'])

// Where a server refusal keyed `key` shows: under the Credit to apply cell of the refused
// insert's row, or in the dialog's error summary (the date, the amount, no key).
export function applyRefusalTarget(key: string): 'row' | 'root' {
    return ROW_REFUSAL_KEYS.has(key) ? 'row' : 'root'
}

// The read view's apply notice (spec §3.1): a writer on a posted record with a balance
// above zero, while the party has something to apply it to (`openCount`).
export function applyNoticeVisible(input: {
    canWrite: boolean
    status: string
    balance: number
    openCount: number
}): boolean {
    return input.canWrite && input.status === 'posted' && input.balance > 0 && input.openCount > 0
}
