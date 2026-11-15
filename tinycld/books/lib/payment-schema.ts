// The receive-payment form's one zod schema, for Save draft and Post alike (spec §3.4).
// Deposit to must be one of the options the chart lists (lib/payment-deposit.ts), which
// hold '' only when the chart has no active Undeposited funds account. The sum rule runs
// in `superRefine` and reports under the list (`payments.root`); each row's rule reports
// under its Payment cell (`payments.<invoice id>.amount`).

import { z } from '@tinycld/core/ui/form'
import { formatMoney } from './money'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney } from './money-text'
import { PAYMENT_METHOD_KEYS } from './payment-methods'
import { fillPaymentText, PAYMENT_MESSAGES } from './payment-texts'
import type { PaymentEntry, PaymentFormValues } from './payment-values'
import { isIsoDay } from './register-range'

// The server counts text in code points (PocketBase text max), not UTF-16 units.
const MAX_REFERENCE = 40
const MAX_MEMO = 4000

function codePoints(text: string): number {
    return [...text].length
}

// The typed text's cents; null when it does not parse in the currency (a too-large
// amount included).
function centsOf(text: string, currency: string): number | null {
    return moneyInputCents(text, currency)
}

// Well-formed digits above the stored-amount limit.
function isTooLarge(text: string, currency: string): boolean {
    return centsOf(text, currency) === null && isWellFormedMoney(text, currency)
}

function amountMessage(text: string, currency: string): string | null {
    if (isTooLarge(text, currency)) return PAYMENT_MESSAGES.amountTooLarge
    const cents = centsOf(text, currency)
    if (cents === null) return PAYMENT_MESSAGES.amountMalformed
    return cents > 0 ? null : PAYMENT_MESSAGES.amountRequired
}

function rowMessage(entry: PaymentEntry, currency: string): string | null {
    const overOpen = fillPaymentText(
        PAYMENT_MESSAGES.rowOverOpen,
        formatMoney(entry.open, currency)
    )
    if (isTooLarge(entry.amount, currency)) return overOpen
    const cents = centsOf(entry.amount, currency)
    if (cents === null) return PAYMENT_MESSAGES.amountMalformed
    if (cents < 0) return PAYMENT_MESSAGES.rowNegative
    return cents > entry.open ? overOpen : null
}

const entrySchema = z.object({ amount: z.string(), open: z.number(), number: z.string() })

export function paymentSchema(
    currency: string,
    depositOptions: readonly string[]
): z.ZodType<PaymentFormValues, PaymentFormValues> {
    const listed = new Set(depositOptions)
    return z
        .object({
            customer: z.string().min(1, PAYMENT_MESSAGES.customerRequired),
            date: z.string().refine(isIsoDay, PAYMENT_MESSAGES.dateInvalid),
            payment_method: z.enum(['', ...PAYMENT_METHOD_KEYS]),
            reference_no: z
                .string()
                .refine(
                    text => codePoints(text) <= MAX_REFERENCE,
                    PAYMENT_MESSAGES.referenceTooLong
                ),
            deposit_to: z
                .string()
                .refine(value => listed.has(value), PAYMENT_MESSAGES.depositInvalid),
            amount: z.string(),
            amountTyped: z.boolean(),
            payments: z.record(z.string(), entrySchema),
            memo: z
                .string()
                .refine(text => codePoints(text) <= MAX_MEMO, PAYMENT_MESSAGES.memoTooLong),
        })
        .superRefine((values, ctx) => {
            const amountIssue = amountMessage(values.amount, currency)
            if (amountIssue !== null) {
                ctx.addIssue({ code: 'custom', path: ['amount'], message: amountIssue })
            }
            let applyCents = 0
            let rowsParse = true
            for (const [invoice, entry] of Object.entries(values.payments)) {
                const message = rowMessage(entry, currency)
                if (message !== null) {
                    ctx.addIssue({ code: 'custom', path: ['payments', invoice, 'amount'], message })
                }
                const cents = centsOf(entry.amount, currency)
                if (cents === null || cents < 0) rowsParse = false
                else applyCents += cents
            }
            // A sum of half-typed amounts means nothing, so the rule waits for every amount
            // to parse.
            const amountCents = centsOf(values.amount, currency)
            if (amountIssue !== null || amountCents === null || !rowsParse) return
            if (applyCents <= amountCents) return
            ctx.addIssue({
                code: 'custom',
                path: ['payments', 'root'],
                message: fillPaymentText(
                    PAYMENT_MESSAGES.sumOverAmount,
                    formatMoney(applyCents, currency),
                    formatMoney(amountCents, currency)
                ),
            })
        })
}
