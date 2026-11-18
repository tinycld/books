// A payment form's one zod schema, for Save draft and Post alike (receive-payment spec
// §3.4, vendor refund spec §3.5). The account must be one of the options the form lists
// (the received payment's hold '' only when the chart has no active Undeposited funds
// account, lib/payment-deposit.ts). The sum rule and the row-date rule run in
// `superRefine`: the sum reports under the list (`payments.root`), each row's rules under
// its cell (`payments.<document id>.amount`). The texts that name the party, the document
// or the account come from the flow.

import { z } from '@tinycld/core/ui/form'
import { formatMoney } from './money'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney } from './money-text'
import { PAYMENT_FLOW, type PaymentFlow, type PaymentFlowTexts, sumErrorOf } from './payment-flow'
import { PAYMENT_METHOD_KEYS } from './payment-methods'
import { PAYMENT_MESSAGES } from './payment-texts'
import type { PaymentEntry, PaymentFormValues } from './payment-values'
import { isIsoDay } from './register-range'

// The server counts text in code points (PocketBase text max), not UTF-16 units.
const MAX_REFERENCE = 40
const MAX_MEMO = 4000

export type PaymentSchemaRules = {
    currency: string
    // The account values the form lists.
    accountOptions: readonly string[]
    texts: PaymentFlowTexts
    sumRule: PaymentFlow['sumRule']
    // Each listed document's date by id: a row that takes an amount may not be dated
    // after the form's date. null runs no date rule.
    rowDates: Readonly<Record<string, string>> | null
}

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

function amountMessage(text: string, rules: PaymentSchemaRules): string | null {
    if (isTooLarge(text, rules.currency)) return PAYMENT_MESSAGES.amountTooLarge
    const cents = centsOf(text, rules.currency)
    if (cents === null) return PAYMENT_MESSAGES.amountMalformed
    return cents > 0 ? null : rules.texts.amountRequired
}

function rowMessage(entry: PaymentEntry, rules: PaymentSchemaRules): string | null {
    const { currency, texts } = rules
    const overOpen = texts.aboveOpen(formatMoney(entry.open, currency))
    if (isTooLarge(entry.amount, currency)) return overOpen
    const cents = centsOf(entry.amount, currency)
    if (cents === null) return PAYMENT_MESSAGES.amountMalformed
    if (cents < 0) return texts.rowNegative
    return cents > entry.open ? overOpen : null
}

// A row that takes an amount and is dated after the form's date; null with no date rule,
// while the form's date is not a real day, or for a row at zero.
function rowDateMessage(
    document: string,
    entry: PaymentEntry,
    date: string,
    rules: PaymentSchemaRules
): string | null {
    const { rowDates, texts } = rules
    if (rowDates === null || texts.datedAfter === null || !isIsoDay(date)) return null
    const cents = centsOf(entry.amount, rules.currency)
    if (cents === null || cents <= 0) return null
    const rowDate = rowDates[document]
    if (rowDate === undefined || rowDate.slice(0, 10) <= date) return null
    return texts.datedAfter(entry.number)
}

const entrySchema = z.object({ amount: z.string(), open: z.number(), number: z.string() })

export function paymentSchemaWith(
    rules: PaymentSchemaRules
): z.ZodType<PaymentFormValues, PaymentFormValues> {
    const listed = new Set(rules.accountOptions)
    const { currency, texts } = rules
    return z
        .object({
            party: z.string().min(1, texts.partyRequired),
            date: z.string().refine(isIsoDay, PAYMENT_MESSAGES.dateInvalid),
            payment_method: z.enum(['', ...PAYMENT_METHOD_KEYS]),
            reference_no: z
                .string()
                .refine(
                    text => codePoints(text) <= MAX_REFERENCE,
                    PAYMENT_MESSAGES.referenceTooLong
                ),
            account: z.string().refine(value => listed.has(value), texts.accountInvalid),
            amount: z.string(),
            amountTyped: z.boolean(),
            payments: z.record(z.string(), entrySchema),
            memo: z
                .string()
                .refine(text => codePoints(text) <= MAX_MEMO, PAYMENT_MESSAGES.memoTooLong),
        })
        .superRefine((values, ctx) => {
            const amountIssue = amountMessage(values.amount, rules)
            if (amountIssue !== null) {
                ctx.addIssue({ code: 'custom', path: ['amount'], message: amountIssue })
            }
            let rowsCents = 0
            let rowsParse = true
            for (const [document, entry] of Object.entries(values.payments)) {
                const message =
                    rowMessage(entry, rules) ?? rowDateMessage(document, entry, values.date, rules)
                if (message !== null) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['payments', document, 'amount'],
                        message,
                    })
                }
                const cents = centsOf(entry.amount, currency)
                if (cents === null || cents < 0) rowsParse = false
                else rowsCents += cents
            }
            // A sum of half-typed amounts means nothing, so the rule waits for every amount
            // to parse.
            const amountCents = centsOf(values.amount, currency)
            if (amountIssue !== null || amountCents === null || !rowsParse) return
            const message = sumErrorOf(rules, { amountCents, rowsCents, currency })
            if (message === '') return
            ctx.addIssue({ code: 'custom', path: ['payments', 'root'], message })
        })
}

// The received payment's schema: its texts, a credit kept for what the rows leave, and no
// row-date rule.
export function paymentSchema(
    currency: string,
    depositOptions: readonly string[]
): z.ZodType<PaymentFormValues, PaymentFormValues> {
    return paymentSchemaWith({
        currency,
        accountOptions: depositOptions,
        texts: PAYMENT_FLOW.texts,
        sumRule: PAYMENT_FLOW.sumRule,
        rowDates: null,
    })
}
