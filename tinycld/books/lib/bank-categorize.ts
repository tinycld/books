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
import { formatMoney, parseMoney } from './money'
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

export type CategorizeFormLine = { account: string; amount: string; memo: string }

export type CategorizeFormValues = {
    payee: string
    memo: string
    lines: CategorizeFormLine[]
}

// The Categorize form. `payee` is a party option id or ''. A one-line form has no amount
// field: its line is the whole bank amount. The bank amount and currency are the bank
// transaction's; only the split rules (each amount, the sum, the line limit) read them,
// and the one-line form has none of those yet.
export function categorizeSchema(
    _bankAmount: number,
    _currency: string
): z.ZodType<CategorizeFormValues, CategorizeFormValues> {
    return z.object({
        payee: z.string(),
        memo: memoField,
        lines: z
            .array(
                z.object({
                    account: z.string().min(1, CHOOSE_ACCOUNT_TEXT),
                    amount: z.string(),
                    memo: z.string(),
                })
            )
            .min(1),
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
// lines of a split carry their typed amounts, signed for the transaction's own direction.
export function categorizeLines(
    values: Pick<CategorizeFormValues, 'lines'>,
    bankAmount: number
): CategorizationLine[] {
    const isOneLine = values.lines.length === 1
    return values.lines.map(line => ({
        account: line.account,
        amount: isOneLine ? Math.abs(bankAmount) : (parseMoney(line.amount) ?? 0),
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
