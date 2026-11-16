// The Pay Bills form's one zod schema, for Pay and Save alike (spec §3.5). Each row's rule
// reports under its Payment cell (`payments.<bill id>.amount`); "at least one row paid"
// and the total's limit report at the root (the form's error summary).
//
// `mode` is a plan decision: on a new screen `reference_no` is Starting check no. (digits,
// at most 9, checked only while the method is Check, the only time the field shows); on
// `?replaces` it is the payment's Check no. (any text up to 40 characters, as the
// expense's Ref no.).

import { z } from '@tinycld/core/ui/form'
import { formatMoney } from './money'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney, maxStoredAmount } from './money-text'
import { PAY_BILLS_MESSAGES } from './pay-bills-texts'
import type { PayBillsFormValues } from './pay-bills-values'
import { PAYMENT_METHOD_KEYS } from './payment-methods'
import { fillPaymentText, PAYMENT_MESSAGES } from './payment-texts'
import type { PaymentEntry } from './payment-values'
import { isIsoDay } from './register-range'

// The server counts text in code points (PocketBase text max), not UTF-16 units.
const MAX_CHECK_NO = 40
const START_CHECK_NO = /^\d{1,9}$/

function codePoints(text: string): number {
    return [...text].length
}

// A row's message, or null. `open` is what the row may take (openByBill, else the
// entry's own).
function rowMessage(entry: PaymentEntry, open: number, currency: string): string | null {
    const overOpen = fillPaymentText(PAYMENT_MESSAGES.rowOverOpen, formatMoney(open, currency))
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

export function payBillsSchema(
    currency: string,
    openByBill: Readonly<Record<string, number>>,
    mode: 'new' | 'replaces'
): z.ZodType<PayBillsFormValues, PayBillsFormValues> {
    return z
        .object({
            paid_from: z.string().min(1, PAY_BILLS_MESSAGES.paidFromRequired),
            date: z.string().refine(isIsoDay, PAY_BILLS_MESSAGES.dateInvalid),
            payment_method: z
                .enum(['', ...PAYMENT_METHOD_KEYS])
                .refine(method => method !== '', PAY_BILLS_MESSAGES.methodRequired),
            reference_no: z.string(),
            payments: z.record(z.string(), entrySchema),
        })
        .superRefine((values, ctx) => {
            const checkIssue = checkNoMessage(values, mode)
            if (checkIssue !== null) {
                ctx.addIssue({ code: 'custom', path: ['reference_no'], message: checkIssue })
            }
            let total = 0
            let paidRows = 0
            let rowsParse = true
            for (const [bill, entry] of Object.entries(values.payments)) {
                const open = openByBill[bill] ?? entry.open
                const message = rowMessage(entry, open, currency)
                if (message !== null) {
                    ctx.addIssue({ code: 'custom', path: ['payments', bill, 'amount'], message })
                }
                const cents = moneyInputCents(entry.amount, currency)
                if (cents === null || cents < 0) rowsParse = false
                else if (cents > 0) {
                    total += cents
                    paidRows += 1
                }
            }
            // A row with its own message is fixed first; the root rules wait for it.
            if (!rowsParse) return
            if (paidRows === 0) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['root'],
                    message: PAY_BILLS_MESSAGES.selectOne,
                })
                return
            }
            if (total > maxStoredAmount) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['root'],
                    message: PAY_BILLS_MESSAGES.totalTooLarge,
                })
            }
        })
}

function checkNoMessage(values: PayBillsFormValues, mode: 'new' | 'replaces'): string | null {
    const text = values.reference_no
    if (mode === 'replaces') {
        return codePoints(text) <= MAX_CHECK_NO ? null : PAY_BILLS_MESSAGES.checkNoTooLong
    }
    if (values.payment_method !== 'check' || text === '') return null
    return START_CHECK_NO.test(text) ? null : PAY_BILLS_MESSAGES.checkDigits
}
