// The apply dialog's one zod schema and texts (vendor credit spec §3.9). The Apply date
// reports under `date`; each row's rule under its Credit to apply cell
// (`payments.<bill id>.amount`); the sum against the unapplied credit and "at least one
// bill" at the root (the dialog's error summary). Pure: every amount is integer cents
// through the shared money helpers.

import { z } from '@tinycld/core/ui/form'
import { formatMoney } from './money'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney } from './money-text'
import { closedThroughMessage } from './opening-balances-messages'
import type { OutstandingRow, Payments } from './payment-allocation'
import { fillPaymentText, PAYMENT_MESSAGES } from './payment-texts'
import type { PaymentEntry } from './payment-values'
import { isIsoDay } from './register-range'

// `%s` is a money text, a vendor's name or a bill number; fillPaymentText fills it. The
// date, row and sum rules match the server's refusals of an application
// (server/vendor_credit_applications.go), which the dialog also shows.
export const APPLY_CREDIT_MESSAGES = {
    dateBeforeCredit: "The apply date can't be before the credit date.",
    // Receive payment's and Pay Bills' text for the same rule.
    rowOverOpen: PAYMENT_MESSAGES.rowOverOpen,
    overUnapplied: 'More than the unapplied credit of %s.',
    selectOne: 'Select at least one bill.',
    // Pay Bills' words for the same open-bills read.
    loadFailed: 'Books could not load the open bills.',
    noOpenBills: '%s has no open bills. The credit stays on the vendor until you post a bill.',
    // The first `%s` is the bill's number, the second the amount the credit gives back.
    removeBody:
        "Remove this credit from Bill %s? The bill's balance goes up by %s and the credit is unapplied again.",
} as const

export type ApplyCreditValues = { date: string; payments: Payments }

export type ApplyCreditSchemaInput = {
    // The credit's date: the apply date is never before it.
    creditDate: string
    // The settings' close date ('' with none): the apply date is after it.
    closeDate: string
    // The credit's balance: the rows together take at most this.
    unappliedCents: number
    // The listed bills: a row takes at most its open balance.
    rows: readonly OutstandingRow[]
    currency: string
}

function dateMessage(date: string, input: ApplyCreditSchemaInput): string | null {
    if (!isIsoDay(date)) return PAYMENT_MESSAGES.dateInvalid
    if (date < input.creditDate) return APPLY_CREDIT_MESSAGES.dateBeforeCredit
    if (input.closeDate !== '' && date <= input.closeDate) {
        return closedThroughMessage(input.closeDate)
    }
    return null
}

// A row's message, or null. `open` is the listed row's open balance.
function rowMessage(entry: PaymentEntry, open: number, currency: string): string | null {
    const overOpen = fillPaymentText(APPLY_CREDIT_MESSAGES.rowOverOpen, formatMoney(open, currency))
    const cents = moneyInputCents(entry.amount, currency)
    if (cents === null) {
        return isWellFormedMoney(entry.amount, currency)
            ? overOpen
            : PAYMENT_MESSAGES.amountMalformed
    }
    if (cents < 0) return PAYMENT_MESSAGES.rowNegative
    return cents > open ? overOpen : null
}

const entrySchema = z.object({ amount: z.string(), open: z.number(), number: z.string() })

export function applyCreditSchema(
    input: ApplyCreditSchemaInput
): z.ZodType<ApplyCreditValues, ApplyCreditValues> {
    const openByBill = new Map(input.rows.map(row => [row.id, row.open]))
    const { currency } = input
    return z
        .object({
            date: z.string(),
            payments: z.record(z.string(), entrySchema),
        })
        .superRefine((values, ctx) => {
            const dateIssue = dateMessage(values.date, input)
            if (dateIssue !== null) {
                ctx.addIssue({ code: 'custom', path: ['date'], message: dateIssue })
            }
            let applied = 0
            let appliedRows = 0
            let rowsParse = true
            // Only the listed bills count: an entry of a bill that left the list since the
            // dialog opened (paid or voided elsewhere) is not shown and is not applied.
            for (const [bill, entry] of Object.entries(values.payments)) {
                const open = openByBill.get(bill)
                if (open === undefined) continue
                const message = rowMessage(entry, open, currency)
                if (message !== null) {
                    ctx.addIssue({ code: 'custom', path: ['payments', bill, 'amount'], message })
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
                ctx.addIssue({
                    code: 'custom',
                    path: ['root'],
                    message: APPLY_CREDIT_MESSAGES.selectOne,
                })
                return
            }
            if (applied > input.unappliedCents) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['root'],
                    message: fillPaymentText(
                        APPLY_CREDIT_MESSAGES.overUnapplied,
                        formatMoney(input.unappliedCents, currency)
                    ),
                })
            }
        })
}

function billsText(bills: number): string {
    return bills === 1 ? '1 bill' : `${bills} bills`
}

// The line under the list: "Applying $50.00 to 2 bills · $0.00 stays unapplied".
export function applySummaryText(
    appliedCents: number,
    bills: number,
    leftCents: number,
    currency: string
): string {
    const applied = formatMoney(appliedCents, currency)
    const left = formatMoney(leftCents, currency)
    return `Applying ${applied} to ${billsText(bills)} · ${left} stays unapplied`
}

// The toast after the applications are written: "Applied $50.00 to 2 bills".
export function appliedToastText(appliedCents: number, bills: number, currency: string): string {
    return `Applied ${formatMoney(appliedCents, currency)} to ${billsText(bills)}`
}
