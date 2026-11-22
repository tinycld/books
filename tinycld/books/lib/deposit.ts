// The deposit's pure helpers (bank deposit spec §3.4, §3.6, §3.8). Every amount is integer
// cents; an item amount and an other funds amount are signed (money out below zero).

import type { BooksDepositItems } from '../types'
import { accountLabel } from './account-options'
import { isDocType } from './audit-record-route'
import { paymentText } from './deposit-accounts'
import { DEPOSIT_MESSAGES } from './deposit-texts'
import { DOC_TYPES } from './doc-types'
import { entryHref } from './entry-route'
import { type LinePartyRow, linePartyName } from './line-party-options'
import { formatMoney, MINUS, maxStoredAmount, TOO_LARGE_TEXT } from './money'
import { moneyInputCents } from './money-input'
import { fillPaymentText } from './payment-texts'
import { formatDay } from './register-range'

type Amounted = { amount: number }

// Selected items, Other funds and Deposit total, in cents.
export function depositTotals(items: readonly Amounted[], lines: readonly Amounted[]) {
    const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0)
    const linesTotal = lines.reduce((sum, line) => sum + line.amount, 0)
    return { itemsTotal, linesTotal, total: itemsTotal + linesTotal }
}

// A journal entry's noun is "entry" (DOC_TYPES); an item names it in full.
const LABEL_NOUNS: Record<string, string> = { journal: 'journal entry' }

function capitalised(text: string): string {
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

// The item's Transaction label, "Payment 1004", "Journal entry 12" (the Go entry nouns
// read the same cases, server/testdata/deposit_cases.json).
export function itemLabel(item: { doc_type: string; number: string }): string {
    const noun = LABEL_NOUNS[item.doc_type] ?? DOC_TYPES[item.doc_type]?.noun ?? item.doc_type
    return `${capitalised(noun)} ${item.number}`.trim()
}

// A journal entry and a transfer name no payment method: their line memo stands in.
const MEMO_DOC_TYPES = new Set(['journal', 'transfer'])

// The item's Payment text: "Check · 98765" (the source document's method label and
// reference no., each left out when empty), or a journal entry's or a transfer's line memo.
export function itemPaymentText(item: {
    doc_type: string
    payment_method: string
    reference_no: string
    memo?: string
}): string {
    if (MEMO_DOC_TYPES.has(item.doc_type)) return item.memo ?? ''
    return paymentText({
        method: item.payment_method,
        reference: item.reference_no,
        depositLabel: '',
        verb: 'deposited to',
    })
}

// An item's amount: money out reads "−$20.00" (U+2212), not formatMoney's hyphen.
export function itemAmountText(amount: number, currency: string): string {
    if (amount >= 0) return formatMoney(amount, currency)
    return `${MINUS}${formatMoney(-amount, currency)}`
}

// Where an item's Transaction link opens (entryHref), from the item's copy fields: an item
// that names a source document came from that document's entry; any other item from a
// manual entry (a journal entry or a transfer). The server fills the copy fields when the
// row is created, so an empty doc type (or one no entry has) is an entry still unknown here.
export function itemHref(item: { entry: string; doc_type: string; document: string }): string {
    const docType = isDocType(item.doc_type) ? item.doc_type : 'journal'
    const origin = item.document === '' ? 'manual' : 'document'
    return entryHref({ id: item.entry, doc_type: docType, origin, document: item.document })
}

const NO_PARTY = '—'

// The Received from name: the row's customer or vendor, "—" when it names none or the
// party row is gone.
export function partyNameOf(row: {
    customer: string
    vendor: string
    customerRow?: LinePartyRow
    vendorRow?: LinePartyRow
}): string {
    return linePartyName(row) || NO_PARTY
}

// A deposited item row as useDepositRecord reads it: its copy fields, its party and
// Undeposited funds account rows, and the memo of its journal line (`lineMemo`, through
// the row's `line` relation, since the item row has no memo copy field).
type DepositReadItemSource = Pick<
    BooksDepositItems,
    | 'line'
    | 'entry'
    | 'document'
    | 'number'
    | 'date'
    | 'amount'
    | 'payment_method'
    | 'reference_no'
    | 'account'
    | 'customer'
    | 'vendor'
> & {
    id: string
    doc_type: string
    customerRow?: LinePartyRow
    vendorRow?: LinePartyRow
    accountRow?: { number: string; name: string }
    lineMemo?: string
}

// The read view's display rows of the items deposited (spec §3.8). `lineId` keys the
// Transaction link's test id by the item's journal line, as the form does. `account` is
// "1200 Undeposited funds" when the items come from more than one Undeposited funds
// account, '' otherwise.
export function depositReadItems(items: readonly DepositReadItemSource[], currency: string) {
    const namesAccount = new Set(items.map(item => item.account)).size > 1
    return items.map(item => ({
        id: item.id,
        lineId: item.line,
        party: partyNameOf(item),
        label: itemLabel(item),
        href: itemHref(item),
        date: formatDay(item.date.slice(0, 10)),
        payment: itemPaymentText({ ...item, memo: item.lineMemo }),
        amount: itemAmountText(item.amount, currency),
        tone: item.amount < 0 ? 'text-danger' : 'text-foreground',
        account: namesAccount && item.accountRow ? accountLabel(item.accountRow) : '',
    }))
}

export type DepositReadItem = ReturnType<typeof depositReadItems>[number]

// A listed item of the form as useDepositForm gives it: its copy fields and related rows,
// whether it is ticked, and the text under its row ('' for none).
type DepositFormItemSource = {
    line: string
    entry: string
    account: string
    date: string
    doc_type: string
    number: string
    document: string
    customer: string
    vendor: string
    amount: number
    payment_method: string
    reference_no: string
    memo: string
    customerRow?: LinePartyRow
    vendorRow?: LinePartyRow
    accountRow?: { number: string; name: string }
    isTicked: boolean
    error: string
}

// The form's display rows of the listed items (spec §3.4): the read view's texts, keyed by
// the journal line, with the tick and the row's refusal. `account` names the item's
// Undeposited funds account only when the list holds more than one (showsItemAccount).
export function depositFormItems(rows: readonly DepositFormItemSource[], currency: string) {
    const namesAccount = showsItemAccount(rows)
    return rows.map(row => ({
        line: row.line,
        party: partyNameOf(row),
        label: itemLabel(row),
        href: itemHref(row),
        date: formatDay(row.date.slice(0, 10)),
        payment: itemPaymentText(row),
        amount: itemAmountText(row.amount, currency),
        tone: row.amount < 0 ? 'text-danger' : 'text-foreground',
        account: namesAccount && row.accountRow ? accountLabel(row.accountRow) : '',
        isTicked: row.isTicked,
        error: row.error,
    }))
}

export type DepositFormItem = ReturnType<typeof depositFormItems>[number]

// The form's selection (spec §3.4): the ticked set is the form's `items` array, one
// `{ line }` per ticked journal line. Stored items come first by position and a new tick
// is appended, so a row's rank in the array is its refusal key `items.<n>` (Decisions,
// Refusal keys). None of these change the array they are given.
export type TickedItem = { line: string }
type Lined = { line: string }

// Ticks a clear row after the rows already ticked, or clears a ticked one.
export function toggleItem(ticked: readonly TickedItem[], line: string): TickedItem[] {
    if (ticked.some(item => item.line === line)) return ticked.filter(item => item.line !== line)
    return [...ticked, { line }]
}

// True when the list has rows and every listed row is ticked.
export function isEveryItemTicked(ticked: readonly TickedItem[], listed: readonly Lined[]) {
    const lines = new Set(ticked.map(item => item.line))
    return listed.length > 0 && listed.every(row => lines.has(row.line))
}

// The header tick box, "Select all" and ⌥A: tick every listed row (the clear ones are
// appended in list order), or clear every tick when every listed row is ticked.
export function selectAll(ticked: readonly TickedItem[], listed: readonly Lined[]): TickedItem[] {
    if (isEveryItemTicked(ticked, listed)) return []
    const lines = new Set(ticked.map(item => item.line))
    const added = listed.filter(row => !lines.has(row.line)).map(row => ({ line: row.line }))
    return [...ticked, ...added]
}

// "Clear selection" and ⌥⌫ clear every tick, whatever is ticked.
export function clearSelection(_ticked: readonly TickedItem[]): TickedItem[] {
    return []
}

/**
 * A draft's list (spec §3.4, Do step 2): the listed items in their order, then each item a
 * stored row names that the view no longer lists (its entry is void, or another deposit
 * holds it), flagged `depositable: false` so the form shows its refusal and lets the user
 * untick it. A line id shows once: a stored item the view still lists is the listed row.
 */
export function mergeItems<L extends Lined, S extends Lined>(
    listed: readonly L[],
    stored: readonly S[]
): ((L & { depositable: true }) | (S & { depositable: false }))[] {
    const listedLines = new Set(listed.map(row => row.line))
    const seen = new Set<string>()
    const stale = stored.filter(row => {
        if (listedLines.has(row.line) || seen.has(row.line)) return false
        seen.add(row.line)
        return true
    })
    return [
        ...listed.map(row => ({ ...row, depositable: true as const })),
        ...stale.map(row => ({ ...row, depositable: false as const })),
    ]
}

// The text under a stored item's row that can no longer be deposited, in the order the
// server's posting checks it (server/deposits.go `msgDepositItemVoid`,
// `msgDepositItemInDeposit`): its entry is not posted, or a posted deposit holds its line.
// null while the item can still be deposited, or while its entry's status is not read yet
// (undefined), so a row never reads "void" before the read says so.
export function staleItemText(
    item: { doc_type: string; number: string },
    entryStatus: string | undefined,
    holder: { number: string } | null
): string | null {
    if (entryStatus !== undefined && entryStatus !== 'posted') {
        return fillPaymentText(DEPOSIT_MESSAGES.itemVoid, itemLabel(item))
    }
    if (holder === null) return null
    return fillPaymentText(
        DEPOSIT_MESSAGES.itemInOtherDeposit,
        itemLabel(item),
        itemLabel({ doc_type: 'deposit', number: holder.number })
    )
}

const ITEM_KEY = /^items\.(\d+)$/

// The line of the row a refusal keyed `items.<n>` names: `n` is the row's rank among the
// deposit's rows in position order (not the stored position, which has gaps after a
// delete). null for a key past the rows or one that names no item.
export function itemLineOfRefusal(
    key: string,
    rows: readonly { line: string; position: number }[]
): string | null {
    const match = ITEM_KEY.exec(key)
    if (!match) return null
    const ordered = [...rows].sort((a, b) => a.position - b.position)
    return ordered[Number(match[1])]?.line ?? null
}

// The most other funds lines a deposit holds (spec §3.5; server/deposits.go
// `maxDepositLines`).
export const DEPOSIT_LINE_LIMIT = 100

// "Add line" (and ⌥↵) adds a line while the deposit holds fewer than the limit.
export function canAddLine(count: number): boolean {
    return count < DEPOSIT_LINE_LIMIT
}

const LINE_KEY = /^lines\.(\d+)\.(account|amount|description|customer|vendor)$/

// The form path a line refusal `lines.<n>.<field>` shows under: `n` is the line's rank,
// which is its index in the form's `lines` array (the save writes positions in that
// order). null for a key that names no line field the form draws.
export function lineRefusalPath(key: string): string | null {
    const match = LINE_KEY.exec(key)
    return match ? `lines.${match[1]}.${match[2]}` : null
}

// The other funds amounts in cents (moneyInputCents: an empty text is 0), with a text that
// does not read as money counted as 0 and flagged, so the totals stay numbers and the
// figure shows "—" (depositFigureText).
export function depositLineCents(lines: readonly { amount: string }[], currency: string) {
    const cents = lines.map(line => moneyInputCents(line.amount, currency))
    return {
        amounts: cents.map(value => value ?? 0),
        hasInvalidAmount: cents.some(value => value === null),
    }
}

const NO_FIGURE = '—'

// The header's big figure, "Deposit total" (spec §3.3): "—" while an other funds amount
// does not parse, "Too large" above the stored-amount limit, else the total.
export function depositFigureText(
    totals: { total: number },
    hasInvalidAmount: boolean,
    currency: string
): string {
    if (hasInvalidAmount) return NO_FIGURE
    if (Math.abs(totals.total) > maxStoredAmount) return TOO_LARGE_TEXT
    return formatMoney(totals.total, currency)
}

// The list's count line, "3 items · $1,750.00": the count and the sum of the listed items.
export function itemsCountText(items: readonly Amounted[], currency: string): string {
    const count = items.length
    const noun = count === 1 ? 'item' : 'items'
    const sum = items.reduce((total, item) => total + item.amount, 0)
    return `${count} ${noun} · ${itemAmountText(sum, currency)}`
}

export type UndepositedListState = 'loading' | 'error' | 'empty' | 'list'

// The items section's branch (spec §3.4): a failed read shows the error banner whatever it
// holds, so zero rows after a failure never read as "Nothing waits".
export function undepositedListState(input: {
    isLoading: boolean
    isError: boolean
    count: number
}): UndepositedListState {
    if (input.isError) return 'error'
    if (input.isLoading) return 'loading'
    return input.count === 0 ? 'empty' : 'list'
}

// A row names its Undeposited funds account under the Transaction link only when the
// listed items are on more than one such account (spec §3.4).
export function showsItemAccount(items: readonly { account: string }[]): boolean {
    return new Set(items.map(item => item.account)).size > 1
}

export type ItemSortColumn = 'date' | 'party'
export type SortDirection = 'asc' | 'desc'

type SortableItem = {
    date: string
    number: string
    customerRow?: LinePartyRow
    vendorRow?: LinePartyRow
}

const byNumber = new Intl.Collator('en-US', { numeric: true })
const byName = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true })

function byDate(a: SortableItem, b: SortableItem): number {
    const day = a.date.slice(0, 10).localeCompare(b.date.slice(0, 10))
    return day !== 0 ? day : byNumber.compare(a.number, b.number)
}

/**
 * The list's order (spec §3.4): by date, then entry number (the default); or by the
 * Received from name, then date. Pressing the sorted header again reverses it. A row that
 * names no party sorts after every named row in both directions.
 */
export function sortItems<R extends SortableItem>(
    rows: readonly R[],
    column: ItemSortColumn,
    direction: SortDirection
): R[] {
    const sign = direction === 'asc' ? 1 : -1
    const compare = (a: R, b: R): number => {
        if (column === 'date') return sign * byDate(a, b)
        const nameA = linePartyName(a)
        const nameB = linePartyName(b)
        if ((nameA === '') !== (nameB === '')) return nameA === '' ? 1 : -1
        const name = byName.compare(nameA, nameB)
        return sign * (name !== 0 ? name : byDate(a, b))
    }
    return [...rows].sort(compare)
}

// The reason under "In Deposit 1002" on the read view of a deposited document (spec §3.10):
// `noun` is the document's own noun (payment, sales receipt, vendor refund, refund receipt).
export function inDepositText(noun: string): string {
    return fillPaymentText(DEPOSIT_MESSAGES.inDepositNotice, noun)
}

// The posted deposit that holds a document's entry, as hooks/useDepositOf reads it: `deposit`
// is null when none holds it (and while the read is off, not ready or failed).
export type DepositRead = {
    isReady: boolean
    isError: boolean
    deposit: { id: string; number: string } | null
}

// The read of a document that no deposit can hold: ready, with no deposit.
export const NOT_DEPOSITED: DepositRead = { isReady: true, isError: false, deposit: null }

// The entry whose deposit a document read view reads (spec §3.10): a sales receipt's and a
// refund receipt's, which post to a deposit account such as Undeposited funds; '' for every
// other kind, so its read is off.
export function depositEntryOf(record: { kindFields: { kind: string }; entry: string }): string {
    const { kind } = record.kindFields
    return kind === 'sales_receipt' || kind === 'refund_receipt' ? record.entry : ''
}

// Whether a read view hides Edit and Void (spec §3.10): true while a posted deposit holds the
// document's entry, and while that read is not ready, so no button shows and then goes away.
// false after a failed read (the server's deposited-item guard refuses the write) and for a
// document with no entry, which no deposit can hold.
export function depositedOffer(read: { hasEntry: boolean } & DepositRead): boolean {
    if (!read.hasEntry || read.isError) return false
    if (!read.isReady) return true
    return read.deposit !== null
}
