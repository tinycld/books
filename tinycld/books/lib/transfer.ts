// The pure rules of a transfer: which accounts it may use, its form schema, and how the
// form maps to the two journal lines and back. The account types mirror
// server/transfer_account_types.json and the amount limit mirrors `maxAmount` in
// server/posting.go; tests/transfer.test.ts drift-tests both against those files.
import { z } from '@tinycld/core/ui/form'
import type { BooksAccounts, BooksJournalEntries, BooksJournalLines } from '../types'
import { filteredAccountOptions } from './account-options'
import { ownBalance } from './account-tree'
import { type EntryFormLine, TOO_LARGE_TEXT } from './entry-lines'
import { parseLineRefusal } from './entry-messages'
import type { EntryFormValues } from './entry-schema'
import { amountText, formatMoney, isWellFormedMoney, maxLineAmount, parseMoney } from './money'
import { isIsoDay } from './register-range'

export const TRANSFER_ACCOUNT_TYPES = [
    'bank',
    'other_current_asset',
    'fixed_asset',
    'other_asset',
    'credit_card',
    'other_current_liability',
    'long_term_liability',
    'equity',
] as const satisfies readonly BooksAccounts['type'][]

const transferTypes: ReadonlySet<string> = new Set(TRANSFER_ACCOUNT_TYPES)

export function isTransferAccount(account: { type: string }): boolean {
    return transferTypes.has(account.type)
}

// The largest line amount the server posts, in cents (ten trillion dollars).
export const MAX_TRANSFER_AMOUNT = maxLineAmount

// The entry memo's limit, in characters (PocketBase counts runes).
export const MEMO_MAX = 4000

export const TRANSFER_ERRORS = {
    fromEmpty: 'Choose the account the money comes from',
    toEmpty: 'Choose the account the money goes to',
    sameAccount: 'Choose two different accounts',
    amountNotNumber: 'Enter an amount like 1,234.50',
    amountNotPositive: 'Enter an amount more than 0',
    amountTooLarge: 'The amount is too large',
    dateInvalid: 'Enter a date as YYYY-MM-DD',
    memoTooLong: 'A memo can have at most 4000 characters',
} as const

// Account ids and the typed text, as the form holds them.
export type TransferFormValues = {
    from: string
    to: string
    amount: string
    date: string
    memo: string
}

export function newTransferValues(today: string, from = ''): TransferFormValues {
    return { from, to: '', amount: '', date: today, memo: '' }
}

export function transferAmountError(text: string, currency: string): string | null {
    if (text.trim() === '' || !isWellFormedMoney(text, currency)) {
        return TRANSFER_ERRORS.amountNotNumber
    }
    const cents = parseMoney(text, currency)
    // Well-formed text that parseMoney cannot hold is above 2^53-1 cents.
    if (cents === null) return TRANSFER_ERRORS.amountTooLarge
    if (cents <= 0) return TRANSFER_ERRORS.amountNotPositive
    if (cents > MAX_TRANSFER_AMOUNT) return TRANSFER_ERRORS.amountTooLarge
    return null
}

// The header figure: a dash until the amount is valid, "Too large" over the limit.
export function transferAmountText(text: string, currency: string): string {
    const error = transferAmountError(text, currency)
    if (error === TRANSFER_ERRORS.amountTooLarge) return TOO_LARGE_TEXT
    if (error !== null) return '—'
    return formatMoney(parseMoney(text, currency) ?? 0, currency)
}

// Save draft and Post share this schema, so a transfer draft is always complete.
export function transferSchema(
    currency: string
): z.ZodType<TransferFormValues, TransferFormValues> {
    return z
        .object({
            from: z.string(),
            to: z.string(),
            amount: z.string(),
            date: z.string(),
            memo: z.string(),
        })
        .superRefine((values, ctx) => {
            const issue = (path: keyof TransferFormValues, message: string) =>
                ctx.addIssue({ code: 'custom', path: [path], message })
            if (values.from === '') issue('from', TRANSFER_ERRORS.fromEmpty)
            if (values.to === '') issue('to', TRANSFER_ERRORS.toEmpty)
            else if (values.to === values.from) issue('to', TRANSFER_ERRORS.sameAccount)
            const amountError = transferAmountError(values.amount, currency)
            if (amountError) issue('amount', amountError)
            if (!isIsoDay(values.date)) issue('date', TRANSFER_ERRORS.dateInvalid)
            // PocketBase counts a text field in runes, so count code points, not UTF-16 units.
            if (Array.from(values.memo).length > MEMO_MAX) {
                issue('memo', TRANSFER_ERRORS.memoTooLong)
            }
        })
}

// The saved line ids of a draft or an edit, or '' for a line not written yet.
export type TransferLineIds = { from: string; to: string }

export const EMPTY_LINE_IDS: TransferLineIds = { from: '', to: '' }

// From is line 1 and To line 2, because the server checks that line 1 is From's credit
// and line 2 is To's debit, and names a refused line by that number.
export function transferLines(
    values: TransferFormValues,
    ids: TransferLineIds
): [EntryFormLine, EntryFormLine] {
    return [
        { id: ids.from, account: values.from, debit: '', credit: values.amount, memo: '' },
        { id: ids.to, account: values.to, debit: values.amount, credit: '', memo: '' },
    ]
}

export function transferEntryValues(
    values: TransferFormValues,
    ids: TransferLineIds
): EntryFormValues {
    return {
        date: values.date,
        memo: values.memo,
        autoReverseOn: '',
        lines: transferLines(values, ids),
    }
}

// Read by side, not by position: a correction or a reversal may store the two lines in
// another position order.
export function transferFromLines(
    lines: readonly Pick<BooksJournalLines, 'id' | 'account' | 'debit' | 'credit'>[],
    currency: string
): { from: string; to: string; amount: string; ids: TransferLineIds } {
    const creditLine = lines.find(line => line.credit !== 0)
    const debitLine = lines.find(line => line.debit !== 0)
    return {
        from: creditLine?.account ?? '',
        to: debitLine?.account ?? '',
        amount: amountText(creditLine?.credit ?? 0, currency),
        ids: { from: creditLine?.id ?? '', to: debitLine?.id ?? '' },
    }
}

// A "Line 1" refusal belongs under From and a "Line 2" refusal under To (transferLines
// orders them so); any other refusal goes to the summary as the server wrote it.
export function transferRefusalField(message: string): {
    field: 'from' | 'to' | null
    text: string
} {
    const { lineNumber, text } = parseLineRefusal(message)
    if (lineNumber === 1) return { field: 'from', text }
    if (lineNumber === 2) return { field: 'to', text }
    return { field: null, text: message }
}

export function transferAccountOptions(
    accounts: Parameters<typeof filteredAccountOptions>[0],
    storedId: string
) {
    return filteredAccountOptions(accounts, storedId, isTransferAccount)
}

// The Chart of Accounts figure: the account's own posted balance, normal side positive.
export function transferAccountBalance(row: {
    type: string
    debit_total: number
    credit_total: number
}): number {
    return ownBalance(row.type, row.debit_total, row.credit_total)
}

export type TransferViewState = 'loading' | 'error' | 'not-found' | 'wrong-type' | 'ready'

// Only a transfer a person made is shown here. Its void reversal keeps doc_type
// 'transfer' but would read with From and To swapped, so it opens as a journal entry.
export function transferViewState(input: {
    isError: boolean
    isReady: boolean
    hasEntry: boolean
    docType: string | undefined
    origin: string | undefined
}): TransferViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (!input.hasEntry) return 'not-found'
    if (input.docType !== 'transfer' || input.origin !== 'manual') return 'wrong-type'
    return 'ready'
}

// Only a posted transfer a person made can be corrected: the server refuses a correction
// whose type or origin differs from the original's, and a draft or a void has nothing to
// replace.
export function replaceTargetState(input: {
    isReady: boolean
    entry: Pick<BooksJournalEntries, 'status' | 'doc_type' | 'origin'> | undefined
}): 'loading' | 'ready' | 'cannot-edit' {
    if (!input.isReady) return 'loading'
    const { entry } = input
    if (!entry) return 'cannot-edit'
    const isPostedTransfer =
        entry.status === 'posted' && entry.doc_type === 'transfer' && entry.origin === 'manual'
    return isPostedTransfer ? 'ready' : 'cannot-edit'
}

export function transferBalanceLine(
    cents: number,
    currency: string
): { text: string; isNegative: boolean } {
    return { text: `Balance ${formatMoney(cents, currency)}`, isNegative: cents < 0 }
}
