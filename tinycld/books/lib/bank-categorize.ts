// The pure rules of the drawer's Categorize and Transfer ways: which way a transaction
// opens with, which accounts the pickers offer, the two form schemas, how a form becomes
// the `lines` json of a `books_bank_categorizations` row, the texts, where a server
// refusal goes, and which row the drawer shows next. The account rules mirror the create
// hook (server/bank_categorize.go); tests/bank-categorize.test.ts runs the shared cases of
// server/testdata/bank_categorize_cases.json against them.
import { z } from '@tinycld/core/ui/form'
import type { SearchPickerOption } from '../components/SearchPicker'
import type { BooksJournalEntries } from '../types'
import { filteredAccountOptions, type OptionAccount } from './account-options'
import { accountTypeDef } from './account-types'
import { entryLabel } from './bank-match'
import { parseLineRefusal } from './entry-messages'
import { formatMoney, isWellFormedMoney, maxLineAmount } from './money'
import { moneyInputCents } from './money-input'
import { MEMO_MAX, TRANSFER_ERRORS, transferAccountOptions } from './transfer'

// The `lines` field of a categorization holds 1 to 50 lines (the server's limit).
export const CATEGORIZE_MAX_LINES = 50

export type TxnWay = 'categorize' | 'match' | 'transfer'

export const SEND_FAILED_TEXT =
    'The transaction could not be sent. Check your connection and try again.'

export const CHOOSE_ACCOUNT_TEXT = 'Choose an account.'
export const CHOOSE_OTHER_ACCOUNT_TEXT = 'Choose the other account.'
export const NO_ACCOUNT_TEXT = 'No account to choose. Add one in Chart of Accounts.'

// A transaction Books has a suggestion for opens on Match (p4-match's rule).
export function defaultWay(suggestionCount: number): TxnWay {
    return suggestionCount > 0 ? 'match' : 'categorize'
}

// The server refuses these kinds on a categorize line: money to or from a customer or a
// vendor is a payment that is recorded, then matched.
const LEFT_OUT_TYPES: ReadonlySet<string> = new Set(['accounts_receivable', 'accounts_payable'])

// The Categorize picker: every active account in chart order and depth, grouped under
// its type's label, but the connection's own account, A/R and A/P.
export function categorizeAccountOptions<A extends OptionAccount>(
    accounts: readonly A[],
    connectionAccountId: string
): SearchPickerOption[] {
    const typeOf = new Map(accounts.map(account => [account.id, account.type]))
    const keep = (account: A) =>
        account.id !== connectionAccountId && !LEFT_OUT_TYPES.has(account.type)
    const { options } = filteredAccountOptions(accounts, '', keep)
    return options.map(option => ({
        id: option.value,
        label: option.label,
        group: accountTypeDef(typeOf.get(option.value) ?? '')?.label,
        indent: option.indent,
    }))
}

// The Transfer picker: the active accounts a transfer may use (transferAccountOptions,
// TRANSFER_ACCOUNT_TYPES) but the connection's own account, grouped as the Categorize
// picker is.
export function transferPickerOptions<A extends OptionAccount>(
    accounts: readonly A[],
    connectionAccountId: string
): SearchPickerOption[] {
    const typeOf = new Map(accounts.map(account => [account.id, account.type]))
    const { options } = transferAccountOptions(accounts, '')
    return options
        .filter(option => option.value !== connectionAccountId)
        .map(option => ({
            id: option.value,
            label: option.label,
            group: accountTypeDef(typeOf.get(option.value) ?? '')?.label,
            indent: option.indent,
        }))
}

// The options whose label holds the typed search, any case, in their order.
export function pickerOptionsMatching(
    options: readonly SearchPickerOption[],
    term: string
): SearchPickerOption[] {
    const needle = term.trim().toLowerCase()
    if (needle === '') return [...options]
    return options.filter(option => option.label.toLowerCase().includes(needle))
}

// The state of Categorize and Record transfer: disabled while the form is not valid (its
// hint names what is missing), while the accounts or the payees could not load (the
// Transfer form has no payee and passes false), while a write is sent or the page's batch
// runs, and while the server takes no writes (core's hint).
export function categorizeSubmitState(input: {
    isValid: boolean
    invalidHint: string
    loadFailed: boolean
    payeeLoadFailed: boolean
    isAdding: boolean
    isBatchPending: boolean
    writesDisabled: boolean
    writesHint: string | undefined
}): { isDisabled: boolean; hint: string | undefined } {
    if (input.writesDisabled) return { isDisabled: true, hint: input.writesHint }
    if (!input.isValid) return { isDisabled: true, hint: input.invalidHint }
    const isBusy =
        input.loadFailed || input.payeeLoadFailed || input.isAdding || input.isBatchPending
    return { isDisabled: isBusy, hint: undefined }
}

// The result line of a Categorize or Record transfer that failed after the drawer moved
// on: it names the transaction, as the drawer no longer shows it.
export function failedResultText(note: { description: string; text: string }): string {
    return `“${note.description}” was not added. ${note.text}`
}

// PocketBase counts a text field in runes, so count code points, not UTF-16 units.
const memoField = z
    .string()
    .refine(memo => Array.from(memo).length <= MEMO_MAX, TRANSFER_ERRORS.memoTooLong)

// A split line's memo limit, in characters (the server's limit on a line's memo).
export const LINE_MEMO_MAX = 1000

export const SPLIT_LIMIT_TEXT = 'A split holds at most 50 lines.'
export const AMOUNT_NOT_ZERO_TEXT = 'Enter an amount other than 0.'

const lineMemoField = z
    .string()
    .refine(
        memo => Array.from(memo).length <= LINE_MEMO_MAX,
        `A line memo can have at most ${LINE_MEMO_MAX} characters`
    )

export type CategorizeFormLine = { account: string; amount: string; memo: string }

export type CategorizeFormValues = {
    payee: string
    memo: string
    lines: CategorizeFormLine[]
}

// The message of one split amount: text that reads as money (the money field's own
// message, or the limit text when it is well formed but too large), not 0, and at most
// the server's line limit. Null when the amount is good. Empty text reads as 0
// (moneyInputCents).
export function splitAmountMessage(text: string, currency: string): string | null {
    const cents = moneyInputCents(text, currency)
    if (cents === null) {
        return isWellFormedMoney(text, currency)
            ? TRANSFER_ERRORS.amountTooLarge
            : TRANSFER_ERRORS.amountNotNumber
    }
    if (cents === 0) return AMOUNT_NOT_ZERO_TEXT
    if (Math.abs(cents) > maxLineAmount) return TRANSFER_ERRORS.amountTooLarge
    return null
}

// What the lines of a split hold, in minor units: `split` is the sum of the typed amounts
// (a line whose text does not read as money counts 0), `remaining` what is left of the
// bank amount without its sign (below 0 when the lines are over). The sum is a BigInt, so
// it stays exact past 2^53 with 50 lines at the line limit.
export function splitTotals(
    bankAmount: number,
    amounts: readonly string[],
    currency: string
): { split: number; remaining: number } {
    const split = amounts.reduce(
        (sum, text) => sum + BigInt(moneyInputCents(text, currency) ?? 0),
        BigInt(0)
    )
    const target = BigInt(Math.trunc(Math.abs(bankAmount)))
    return { split: Number(split), remaining: Number(target - split) }
}

// The hint of a disabled Categorize on a split, and the form's root message.
export function splitHintText(bankAmount: number, currency: string): string {
    return `The lines must add up to ${formatMoney(Math.abs(bankAmount), currency)}.`
}

// The hint of a disabled Categorize on a split, by what the lines miss first: an account
// on a line, then the first amount that is not good (splitAmountMessage), then the sum.
export function splitSubmitHint(
    bankAmount: number,
    currency: string,
    lines: readonly Pick<CategorizeFormLine, 'account' | 'amount'>[]
): string {
    if (lines.some(line => line.account === '')) return CHOOSE_ACCOUNT_TEXT
    for (const line of lines) {
        const message = splitAmountMessage(line.amount, currency)
        if (message) return message
    }
    return splitHintText(bankAmount, currency)
}

// The totals line: "Split $970.00 of $970.00".
export function splitTotalText(split: number, bankAmount: number, currency: string): string {
    return `Split ${formatMoney(split, currency)} of ${formatMoney(Math.abs(bankAmount), currency)}`
}

// The second line of the totals: what remains, or by how much the lines are over; ''
// when they add up.
export function splitRemainingText(remaining: number, currency: string): string {
    if (remaining === 0) return ''
    const amount = formatMoney(Math.abs(remaining), currency)
    return remaining > 0 ? `Remaining ${amount}` : `Over by ${amount}`
}

// The Categorize form. `payee` is a party option id or ''. A one-line form has no amount
// field: its line is the whole bank amount. A split (two or more lines) asks each line for
// an amount (splitAmountMessage) and puts splitHintText on the form root when the lines do
// not add up to the bank amount without its sign.
export function categorizeSchema(
    bankAmount: number,
    currency: string
): z.ZodType<CategorizeFormValues, CategorizeFormValues> {
    return z
        .object({
            payee: z.string(),
            memo: memoField,
            lines: z
                .array(
                    z.object({
                        account: z.string().min(1, CHOOSE_ACCOUNT_TEXT),
                        amount: z.string(),
                        memo: lineMemoField,
                    })
                )
                .min(1)
                .max(CATEGORIZE_MAX_LINES, SPLIT_LIMIT_TEXT),
        })
        .superRefine((values, ctx) => {
            if (values.lines.length < 2) return
            values.lines.forEach((line, index) => {
                const message = splitAmountMessage(line.amount, currency)
                if (message) {
                    ctx.addIssue({ code: 'custom', path: ['lines', index, 'amount'], message })
                }
            })
            const amounts = values.lines.map(line => line.amount)
            if (splitTotals(bankAmount, amounts, currency).remaining !== 0) {
                ctx.addIssue({ code: 'custom', message: splitHintText(bankAmount, currency) })
            }
        })
}

export type BankTransferFormValues = { account: string; memo: string }

export const bankTransferSchema: z.ZodType<BankTransferFormValues, BankTransferFormValues> =
    z.object({
        account: z.string().min(1, CHOOSE_OTHER_ACCOUNT_TEXT),
        memo: memoField,
    })

export type CategorizationLine = { account: string; amount: number; memo: string }

// The `lines` json of a categorize row. One line is the bank amount without its sign; the
// lines of a split carry their typed amounts, signed for the transaction's own direction,
// read in the currency the schema reads them in.
export function categorizeLines(
    values: Pick<CategorizeFormValues, 'lines'>,
    bankAmount: number,
    currency: string
): CategorizationLine[] {
    const isOneLine = values.lines.length === 1
    return values.lines.map(line => ({
        account: line.account,
        amount: isOneLine ? Math.abs(bankAmount) : (moneyInputCents(line.amount, currency) ?? 0),
        memo: line.memo,
    }))
}

// The `lines` json of a transfer row: the other account for the bank amount, no memo.
export function transferLine(bankAmount: number, accountId: string): CategorizationLine[] {
    return [{ account: accountId, amount: Math.abs(bankAmount), memo: '' }]
}

// The line over the Transfer fields: money out leaves the connection's account, money in
// enters it.
export function transferSummaryText(amount: number, accountLabel: string, currency: string) {
    const direction = amount < 0 ? 'from' : 'into'
    return `A transfer of ${formatMoney(Math.abs(amount), currency)} ${direction} ${accountLabel}.`
}

// The result line after a Categorize or a Record transfer, once the posted entry is read.
export function addedResultText(
    entry: Pick<BooksJournalEntries, 'number' | 'doc_type' | 'origin'> | undefined
): string {
    if (!entry) return ''
    return `Added ${entryLabel(entry)}.`
}

// A "Line n:" refusal goes under that line's Account, or its Amount when the text is about
// the amount; any other refusal names no field.
export function categorizeRefusalField(
    message: string
): `lines.${number}.account` | `lines.${number}.amount` | null {
    const { lineNumber, text } = parseLineRefusal(message)
    if (lineNumber === null) return null
    const index = lineNumber - 1
    return /\bamount\b/i.test(text) ? `lines.${index}.amount` : `lines.${index}.account`
}

// The transfer form has one account field, so every "Line n:" refusal goes under it.
export function bankTransferRefusalField(message: string): 'account' | null {
    return parseLineRefusal(message).lineNumber === null ? null : 'account'
}

// The row the drawer shows after the open one leaves the list: the row under it, or the
// row above when it was the last. `rows` are the shown row ids in order.
export function nextTxnId(rows: readonly string[], id: string): string | null {
    const index = rows.indexOf(id)
    if (index === -1) return null
    return rows[index + 1] ?? rows[index - 1] ?? null
}

// The account picker's flags from its read. A failed read is not loading: the picker
// shows its "could not load" row with Retry.
export function pickerStateOf(input: {
    isLoading: boolean
    isError: boolean
    options: readonly SearchPickerOption[]
}): { isLoading: boolean; loadFailed: boolean; emptyText: string | undefined } {
    const loadFailed = input.isError
    return {
        isLoading: input.isLoading && !loadFailed,
        loadFailed,
        emptyText: input.options.length === 0 ? NO_ACCOUNT_TEXT : undefined,
    }
}

export type WayView = 'loading' | 'switch' | 'reader' | 'none'

// What the drawer draws under its fields: no switch on a Reviewed or Excluded row; a
// reader sees only the Match section; a writer sees the switch once the suggestions
// decide the default way.
export function wayViewOf(input: {
    canWrite: boolean
    status: string
    suggestionsReady: boolean
}): WayView {
    if (input.status !== 'for_review') return 'none'
    if (!input.canWrite) return 'reader'
    return input.suggestionsReady ? 'switch' : 'loading'
}
