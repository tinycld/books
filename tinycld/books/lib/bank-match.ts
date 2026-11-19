import { and, eq, gt, gte, ilike, inArray, isUndefined, lte, not, or, type Ref } from '@tanstack/db'
import { z } from '@tinycld/core/ui/form'
import type { BooksJournalEntries, BooksJournalLines } from '../types'
import type { BatchOutcome } from './bank-review'
import { addDays } from './document-dates'
import { searchPieces } from './list-search'
import { formatMoney } from './money'
import { entryTypeLabel } from './register'
import { formatDay, isIsoDay } from './register-range'
import { parseSearchAmount } from './search-amount'
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

export const MATCH_SIZE_HINT = `A match holds at most ${MATCH_MAX_LINES} Books transactions.`

// The drawer's Match: the rule of every write control (writeControlState: disabled with the
// server's hint while it takes no writes, disabled while a change runs), then disabled with
// the size hint above MATCH_MAX_LINES chosen rows (the `lines` field's maxSelect), then
// with the "Choose …" hint until the choice adds up to the bank amount exactly.
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
    if (input.chosenCount > MATCH_MAX_LINES) return { isDisabled: true, hint: MATCH_SIZE_HINT }
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
// the chosen rows a batch did not send because they have no single suggestion; with none
// matched, only that sentence.
export function matchResultText(outcome: BatchOutcome, skipped: number): string {
    const count = outcome.done.length
    const matched = `Matched ${count} ${transactionsNoun(count)}.`
    if (skipped === 0) return matched
    if (count === 0) return skippedText(skipped)
    return `${matched} ${skippedText(skipped)}`
}

export const BAR_MATCH_NONE_HINT = 'None of the chosen transactions has exactly one match.'

// The selection bar's Match: the rule of every write control, then disabled with its hint
// while no chosen row has exactly one suggestion (the only rows it sends).
export function barMatchState(input: {
    matchableCount: number
    isPending: boolean
    writesDisabled: boolean
    writesHint: string | undefined
}): WriteControlState {
    const control = writeControlState(input)
    if (control.isDisabled) return control
    if (input.matchableCount === 0) return { isDisabled: true, hint: BAR_MATCH_NONE_HINT }
    return { isDisabled: false, hint: undefined }
}

// ---- Find other matches ----

// The find mode's range starts at the suggestion window around the bank date.
export function defaultFindRange(bankDate: string): { from: string; to: string } {
    return {
        from: addDays(bankDate, -MATCH_DAYS_BEFORE) ?? bankDate,
        to: addDays(bankDate, MATCH_DAYS_AFTER) ?? bankDate,
    }
}

const findDay = z.string().refine(isIsoDay, 'Enter a date as YYYY-MM-DD')

// The find mode's From and To. ISO days compare as text, so From after To is a text
// comparison.
export const findRangeSchema = z
    .object({ from: findDay, to: findDay })
    .refine(range => range.from <= range.to, {
        path: ['from'],
        message: 'From must be on or before To.',
    })

export type FindRange = z.infer<typeof findRangeSchema>

// "Jun 5", formatDay without its year.
function dayWithoutYear(day: string): string {
    return formatDay(day).replace(/, \d+$/, '')
}

// The find mode's empty list: the account and the range, the year once when both days
// are in one year; or, under a search, the search.
export function findEmptyText(
    accountLabel: string,
    from: string,
    to: string,
    hasSearch: boolean
): string {
    if (hasSearch) return 'No Books transaction matches this search.'
    const sameYear = from.slice(0, 4) === to.slice(0, 4)
    const fromText = sameYear ? dayWithoutYear(from) : formatDay(from)
    return `No Books transaction on ${accountLabel} from ${fromText} to ${formatDay(to)}.`
}

type TextColumn = Parameters<typeof ilike>[0]
type AnyColumn = Parameters<typeof isUndefined>[0]
type Clause = ReturnType<typeof eq>
type LineRef = Ref<BooksJournalLines>

// The refs the find query's `where` reads: the journal line's own fields; from its joined
// entry, customer and vendor, the entry number, status and origin, the names and the entry
// memo; and the id of its left-joined books_bank_match_lines row (undefined when no bank
// transaction holds the line).
export type FindColumns = {
    account: LineRef['account']
    posted: LineRef['posted']
    debit: LineRef['debit']
    credit: LineRef['credit']
    date: LineRef['date']
    number: TextColumn
    entryStatus: TextColumn
    entryOrigin: TextColumn
    matchLineId: AnyColumn
    customerName: TextColumn
    vendorName: TextColumn
    lineMemo: TextColumn
    entryMemo: TextColumn
}

export type FindWhereInput = {
    account: string
    side: MatchSide
    from: string
    to: string
    search: string
    currency: string
}

// The search's words: each piece of searchPieces (cut at `%`, `_` and `\`) split again at
// white space, so "1007 acme" needs both words, each anywhere.
function findWords(search: string): string[] {
    return searchPieces(search).flatMap(piece => piece.split(/\s+/).filter(word => word !== ''))
}

function allOf(first: Clause, rest: Clause[]): Clause {
    const [second, ...others] = rest
    return second === undefined ? first : and(first, second, ...others)
}

// Every word in the entry number, the customer or vendor name, or the line or entry memo;
// or, when the whole text reads as money, that amount on the side's field.
function findSearchClause(
    columns: FindColumns,
    sideAmount: FindColumns['debit'],
    input: FindWhereInput
): Clause | null {
    const [first, ...rest] = findWords(input.search).map(word =>
        or(
            ilike(columns.number, `%${word}%`),
            ilike(columns.customerName, `%${word}%`),
            ilike(columns.vendorName, `%${word}%`),
            ilike(columns.lineMemo, `%${word}%`),
            ilike(columns.entryMemo, `%${word}%`)
        )
    )
    if (first === undefined) return null
    const text = allOf(first, rest)
    const cents = parseSearchAmount(input.search, input.currency)
    if (cents === null) return text
    return or(text, eq(sideAmount, cents))
}

function sideAmountOf(columns: FindColumns, side: MatchSide): FindColumns['debit'] {
    return side === 'debit' ? columns.debit : columns.credit
}

// The clauses of canMatchLine as a query reads them: posted lines of the account on the
// bank amount's side whose entry is posted and is not the reversal of a void, and that no
// bank transaction holds (no match-line row). In the query, so a page holds only lines
// that can be matched and paging is never stopped by rows dropped after it.
function matchableClauses(
    columns: FindColumns,
    account: string,
    side: MatchSide
): [Clause, ...Clause[]] {
    return [
        eq(columns.account, account),
        eq(columns.posted, true),
        gt(sideAmountOf(columns, side), 0),
        eq(columns.entryStatus, 'posted'),
        not(eq(columns.entryOrigin, 'void_reversal')),
        isUndefined(columns.matchLineId),
    ]
}

// The `where` of the find query: the matchable lines, dated from From to To (both
// included; ISO days compare as text), and the search. `and` and `or` never get one
// argument (lib/list-search.ts).
export function findWhere(columns: FindColumns, input: FindWhereInput): Clause {
    const [first, ...rest] = matchableClauses(columns, input.account, input.side)
    const clauses: Clause[] = [...rest, gte(columns.date, input.from), lte(columns.date, input.to)]
    const search = findSearchClause(columns, sideAmountOf(columns, input.side), input)
    if (search) clauses.push(search)
    return allOf(first, clauses)
}

// The `where` of the chosen lines that are not suggestions: those of `ids` that can still
// be matched. A chosen line that was voided, moved or matched elsewhere leaves the result,
// so it leaves the choice as a suggestion that left the view does.
export function chosenWhere(
    columns: FindColumns,
    lineId: AnyColumn,
    input: { account: string; side: MatchSide; ids: readonly string[] }
): Clause {
    return allOf(
        inArray(lineId, [...input.ids]),
        matchableClauses(columns, input.account, input.side)
    )
}

export type FindViewState = 'loading' | 'error' | 'empty' | 'ready'

// A load error wins, so Retry is always offered. While later pages exist the list is not
// empty: it is still loading them.
export function findViewState(
    isError: boolean,
    isReady: boolean,
    rowCount: number,
    hasNextPage: boolean
): FindViewState {
    if (isError) return 'error'
    if (!isReady) return 'loading'
    if (rowCount > 0) return 'ready'
    return hasNextPage ? 'loading' : 'empty'
}

type FindLineRow = {
    debit: number
    credit: number
    entry: { status: string; origin: string } | undefined
    matchLine: unknown
}

// The find query's rows that can be matched, in their order: canMatchLine over the row's
// entry and its match-line row. A row whose entry has not arrived is left out until it
// does. The account and the side are the query's own (findWhere), so they hold here; the
// line's own side stands in for the bank amount's.
export function matchableLines<T extends FindLineRow>(rows: readonly T[]): T[] {
    return rows.filter(row => {
        if (!row.entry) return false
        return canMatchLine({
            bankAmount: row.debit > 0 ? 1 : -1,
            debit: row.debit,
            credit: row.credit,
            sameAccount: true,
            entryStatus: row.entry.status,
            origin: row.entry.origin,
            matched: row.matchLine !== undefined,
        })
    })
}
