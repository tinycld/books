import type { BooksJournalEntries } from '../types'
import type { BatchOutcome } from './bank-review'
import { formatMoney } from './money'
import { entryTypeLabel } from './register'
import { formatDay } from './register-range'
import { type WriteControlState, writeControlState } from './write-control'

// The rules of matching a bank transaction to Books transactions (journal lines). Pure:
// no React and no collection. The rule "can this line be matched, and on which side" is
// also the Go create hook's (server/bank_match.go); both run every case of
// server/testdata/bank_match_cases.json.
//
// This module imports only types from bank-review.ts: bank-review.ts reads
// matchResultText from here, and a value import back would be a require cycle.

// The suggestion window, in days around the bank date (the view
// books_bank_match_suggestions holds the same bounds).
export const MATCH_DAYS_BEFORE = 90
export const MATCH_DAYS_AFTER = 7
// A match holds 1 to 50 Books transactions (the `lines` field's maxSelect).
export const MATCH_MAX_LINES = 50

export const MATCH_TRANSPORT_TEXT =
    'The match could not be sent. Check your connection and try again.'

// Money in (a bank amount above 0) matches a debit of the account; money out a credit.
export type MatchSide = 'debit' | 'credit'

export function matchSide(amount: number): MatchSide {
    return amount > 0 ? 'debit' : 'credit'
}

// A line's unsigned amount: its debit when it has one, else its credit.
export function lineAmount(line: { debit: number; credit: number }): number {
    return line.debit > 0 ? line.debit : line.credit
}

// A line can be matched when its entry is posted and is not the reversal of a void, the
// line is on the connection's account, no other bank transaction holds it, and it has an
// amount on the side the bank amount needs. The amount itself is not checked here: the
// sum of a match is (matchTotals).
export function canMatchLine(input: {
    bankAmount: number
    debit: number
    credit: number
    sameAccount: boolean
    entryStatus: string
    origin: string
    matched: boolean
}): boolean {
    if (input.entryStatus !== 'posted' || input.origin === 'void_reversal') return false
    if (!input.sameAccount || input.matched) return false
    const side = matchSide(input.bankAmount)
    return side === 'debit' ? input.debit > 0 : input.credit > 0
}

// The bank amount unsigned, the sum of the chosen lines, and how far apart they are
// (never negative). Integer minor units, so the sums are exact.
export function matchTotals(
    bankAmount: number,
    chosen: readonly { debit: number; credit: number }[]
): { target: number; chosen: number; difference: number } {
    const target = Math.abs(bankAmount)
    const sum = chosen.reduce((total, line) => total + lineAmount(line), 0)
    return { target, chosen: sum, difference: Math.abs(target - sum) }
}

// The suggestions grouped by bank transaction in one pass, each group in input order.
export function suggestionsByTxn<T extends { bank_transaction: string }>(
    rows: readonly T[]
): Map<string, T[]> {
    const byTxn = new Map<string, T[]>()
    for (const row of rows) {
        const group = byTxn.get(row.bank_transaction)
        if (group) group.push(row)
        else byTxn.set(row.bank_transaction, [row])
    }
    return byTxn
}

type LabelledEntry = Pick<BooksJournalEntries, 'number' | 'doc_type' | 'origin'>

// "Transfer 1007", as the register's rows name an entry (lib/register.ts). A void
// reversal is never matched, so the reversed number is not needed.
export function entryLabel(entry: LabelledEntry): string {
    return `${entryTypeLabel(entry.origin, '', entry.doc_type)} ${entry.number}`
}

// The mark of a For review row: "1 match · Transfer 1007 · Sep 3, 2026" on a wide row,
// without the day on a phone card (the card shows the bank day before it); "3 matches"
// for several.
export function suggestionText(
    count: number,
    entry: (LabelledEntry & { date: string }) | undefined,
    form: 'row' | 'card'
): string {
    if (count !== 1) return `${count} matches`
    if (!entry) return '1 match'
    const label = `1 match · ${entryLabel(entry)}`
    return form === 'row' ? `${label} · ${formatDay(entry.date)}` : label
}

function chooseHint(target: number, currency: string): string {
    return `Choose Books transactions that add up to ${formatMoney(target, currency)}.`
}

// The drawer's Match: the rule of every write control (writeControlState: disabled with the
// server's hint while it takes no writes, disabled while a change runs), then disabled with
// the "Choose …" hint until the choice adds up to the bank amount exactly.
export function matchSubmitState(input: {
    chosenCount: number
    difference: number
    target: number
    currency: string
    isPending: boolean
    writesDisabled: boolean
    writesHint: string | undefined
}): WriteControlState {
    const control = writeControlState(input)
    if (control.isDisabled) return control
    if (input.chosenCount === 0 || input.difference !== 0) {
        return { isDisabled: true, hint: chooseHint(input.target, input.currency) }
    }
    return { isDisabled: false, hint: undefined }
}

// Whether the batch run in flight is the drawer's match of `txnId`: only then does that
// drawer show its Match as sending. Another transaction's drawer, a bar run and a drawer
// move are not this transaction's match.
export function matchSendingFor(
    pending: { origin: string; kind: string; ids: readonly string[] } | null | undefined,
    txnId: string
): boolean {
    if (!pending) return false
    return pending.origin === 'drawer' && pending.kind === 'match' && pending.ids.includes(txnId)
}

// The drawer's text when Books found no suggestion.
export function matchEmptyText(bankAmount: number, bankDate: string, currency: string): string {
    const amount = formatMoney(Math.abs(bankAmount), currency)
    return `Books found no transaction of ${amount} near ${formatDay(bankDate)}.`
}

function transactionsNoun(count: number): string {
    return count === 1 ? 'transaction' : 'transactions'
}

function skippedText(skipped: number): string {
    if (skipped === 1) return '1 needs a choice: open it to match.'
    return `${skipped} need a choice: open them to match.`
}

// The result line of a match that went through: "Matched 1 transaction." `skipped` counts
// the chosen rows a batch did not send because they have no single suggestion.
export function matchResultText(outcome: BatchOutcome, skipped: number): string {
    const count = outcome.done.length
    const matched = `Matched ${count} ${transactionsNoun(count)}.`
    if (skipped === 0) return matched
    return `${matched} ${skippedText(skipped)}`
}
