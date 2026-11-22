// The deposit's pure helpers (bank deposit spec §3.4, §3.6, §3.8). Every amount is integer
// cents; an item amount and an other funds amount are signed (money out below zero).

import type { BooksDepositItems } from '../types'
import { accountLabel } from './account-options'
import { isDocType } from './audit-record-route'
import { paymentText } from './deposit-accounts'
import { DOC_TYPES } from './doc-types'
import { entryHref } from './entry-route'
import { type LinePartyRow, linePartyName } from './line-party-options'
import { formatMoney, MINUS } from './money'
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
