// The deposit form's one zod schema, for Save draft and Post alike (bank deposit spec §3.6,
// Q6). The rules the server holds too are the validity cases of
// server/testdata/deposit_cases.json, which tests/deposit-schema.test.ts runs against this
// schema and the Go tests against server/deposits.go.
//
// Every rule runs in one `superRefine`, so each refusal shows at once whatever else is
// wrong. Keys: `deposit_to`, `date`, `memo`, `lines.<n>.<field>`; an item's refusal is the
// row's root error (`items.<n>.root`, drawn under that row) and a form-level one the
// form's root (`root`, drawn in FormErrorSummary).

import { z } from '@tinycld/core/ui/form'
import { accountLabel } from './account-options'
import { itemLabel } from './deposit'
import { DEPOSIT_MESSAGES } from './deposit-texts'
import type { DepositFormValues, DepositLineValues } from './deposit-values'
import { moneyInputCents } from './money-input'
import { isWellFormedMoney, maxStoredAmount } from './money-text'
import { fillPaymentText } from './payment-texts'
import { formatDay, isIsoDay } from './register-range'

// The server's limits (server/deposits.go `maxDepositItems`, `maxDepositLines`, and the
// text max of books_deposits.memo and books_deposit_lines.description). The server counts
// text in code points (PocketBase text max), not UTF-16 units.
const MAX_ITEMS = 500
const MAX_LINES = 100
const MAX_DESCRIPTION = 1000
const MAX_MEMO = 4000

// The account types an other funds line may not name (server/deposits.go
// `msgDepositLineControl`): a deposit writes no document or party balance.
const CONTROL_TYPES = new Set(['accounts_receivable', 'accounts_payable'])

export type DepositSchemaContext = {
    // The Deposit to option values the form lists (lib/deposit-accounts.ts
    // `bankAccountOptions`).
    bankOptions: readonly string[]
    // Every item the list shows, by journal line id: the listed ones and a draft's stored
    // ones (lib/deposit.ts `mergeItems`).
    items: Readonly<
        Record<string, { amount: number; date: string; doc_type: string; number: string }>
    >
    // The chart's accounts by id, for the other funds line account rules.
    accounts: Readonly<
        Record<string, { number: string; name: string; type: string; inactive: boolean }>
    >
}

function codePoints(text: string): number {
    return [...text].length
}

// The typed amount's cents, or the message under its cell: 0 (an empty cell included) is
// refused, as is text that does not parse or parses above the stored-amount limit.
function lineAmount(text: string, currency: string): { cents: number } | { message: string } {
    const cents = moneyInputCents(text, currency)
    if (cents === null) {
        const message = isWellFormedMoney(text, currency)
            ? DEPOSIT_MESSAGES.amountTooLarge
            : DEPOSIT_MESSAGES.amountMalformed
        return { message }
    }
    if (cents === 0) return { message: DEPOSIT_MESSAGES.amountZero }
    return { cents }
}

// The message under a line's Account; null when the account is fine or not in the chart
// the form read (the server refuses an account that does not exist).
function lineAccountMessage(
    line: DepositLineValues,
    depositTo: string,
    accounts: DepositSchemaContext['accounts']
): string | null {
    if (line.account === '') return DEPOSIT_MESSAGES.lineAccountRequired
    const account = accounts[line.account]
    if (account === undefined) return null
    if (CONTROL_TYPES.has(account.type)) return DEPOSIT_MESSAGES.lineAccountControl
    if (line.account === depositTo) return DEPOSIT_MESSAGES.lineAccountDepositTo
    if (account.inactive) {
        return fillPaymentText(DEPOSIT_MESSAGES.lineAccountInactive, accountLabel(account))
    }
    return null
}

export function depositSchema(
    currency: string,
    context: DepositSchemaContext
): z.ZodType<DepositFormValues, DepositFormValues> {
    const banks = new Set(context.bankOptions)
    const lineSchema = z.object({
        customer: z.string(),
        vendor: z.string(),
        account: z.string(),
        description: z.string(),
        amount: z.string(),
    })
    return z
        .object({
            deposit_to: z.string(),
            date: z.string(),
            memo: z.string(),
            items: z.array(z.object({ line: z.string() })),
            lines: z.array(lineSchema),
        })
        .superRefine((values, ctx) => {
            const add = (path: (string | number)[], message: string) =>
                ctx.addIssue({ code: 'custom', path, message })

            if (!banks.has(values.deposit_to)) {
                add(['deposit_to'], DEPOSIT_MESSAGES.depositToInvalid)
            }
            const isDay = isIsoDay(values.date)
            if (!isDay) add(['date'], DEPOSIT_MESSAGES.dateInvalid)
            if (codePoints(values.memo) > MAX_MEMO) add(['memo'], DEPOSIT_MESSAGES.memoTooLong)

            let linesCents = 0
            let linesParse = true
            values.lines.forEach((line, index) => {
                const accountMessage = lineAccountMessage(line, values.deposit_to, context.accounts)
                if (accountMessage !== null) add(['lines', index, 'account'], accountMessage)
                if (codePoints(line.description) > MAX_DESCRIPTION) {
                    add(['lines', index, 'description'], DEPOSIT_MESSAGES.descriptionTooLong)
                }
                const amount = lineAmount(line.amount, currency)
                if ('message' in amount) {
                    add(['lines', index, 'amount'], amount.message)
                    linesParse = false
                } else {
                    linesCents += amount.cents
                }
            })

            let itemsCents = 0
            values.items.forEach((ticked, index) => {
                const item = context.items[ticked.line]
                if (item === undefined) return
                itemsCents += item.amount
                const day = item.date.slice(0, 10)
                if (!isDay || day <= values.date) return
                add(
                    ['items', index, 'root'],
                    fillPaymentText(DEPOSIT_MESSAGES.itemAfterDate, itemLabel(item), formatDay(day))
                )
            })

            if (values.items.length > MAX_ITEMS) add(['root'], DEPOSIT_MESSAGES.itemLimit)
            if (values.lines.length > MAX_LINES) add(['root'], DEPOSIT_MESSAGES.lineLimit)

            if (values.items.length === 0 && values.lines.length === 0) {
                add(['root'], DEPOSIT_MESSAGES.nothingToDeposit)
                return
            }
            // A total of half-typed amounts means nothing, so the total rules wait for every
            // line amount to parse.
            if (!linesParse) return
            const total = itemsCents + linesCents
            if (total <= 0) add(['root'], DEPOSIT_MESSAGES.totalNotAboveZero)
            else if (total > maxStoredAmount) add(['root'], DEPOSIT_MESSAGES.amountTooLarge)
        })
}
