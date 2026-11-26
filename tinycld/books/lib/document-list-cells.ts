// The text of a document list's table cells, cards and names-column rows, and the sizes
// the windowed lists draw them at (the Sales lists and
// Purchase lists design specs, §3 "Rows and columns"). The header cell and the
// row cell share `columnStyle`, so the columns line up.

import type { ViewStyle } from 'react-native'
import {
    type DocumentListRow,
    type DocumentListTab,
    kindLabel,
    type ListColumnKey,
    listColumn,
} from './document-list'
import type { ListAreaKey } from './list-areas'
import { formatMoney } from './money'
import { transactionTotalText } from './party-transactions'
import { type CategoryNames, categoryText } from './purchase-category'
import { formatDay } from './register-range'

const DASH = '—'

export const LIST_ROW_HEIGHT = 48
export const LIST_CARD_HEIGHT = 72
export const LIST_NAME_ROW_HEIGHT = 60

// A card's padding stays the same at every font scale; its two text lines (the title,
// then the detail beside the status badge) grow with the native font scale, so a card is
// never shorter than its text.
const CARD_PADDING = 24
const CARD_TEXT_HEIGHT = LIST_CARD_HEIGHT - CARD_PADDING

function textOrDash(text: string): string {
    return text === '' ? DASH : text
}

function dayOrDash(day: string): string {
    return day === '' ? DASH : formatDay(day)
}

// The shown parts, with an empty part left out rather than drawn as "—".
function joinShown(parts: readonly string[]): string {
    return parts.filter(part => part !== '').join(' · ')
}

// The Category cell's names before the list reads them: an account or product reads "—".
const NO_CATEGORY_NAMES: CategoryNames = { accounts: new Map(), products: new Map() }

// A refund receipt's and a write-off's amount is negative on every tab (refund receipt spec
// §3.13, write-off spec §3.6), and a signed tab (All sales, All purchases) shows a credit
// memo's or a vendor credit's amount negative too, each with a typographic minus; a tab of
// one kind shows every other amount positive.
function isAlwaysNegative(row: DocumentListRow): boolean {
    return row.kind === 'refund_receipt' || row.kind === 'write_off'
}

function isShownSigned(row: DocumentListRow, tab: DocumentListTab): boolean {
    return tab.isSigned || isAlwaysNegative(row)
}

function amountOf(row: DocumentListRow, tab: DocumentListTab, currency: string): string {
    if (isShownSigned(row, tab)) return transactionTotalText(row, currency)
    return formatMoney(Math.abs(row.total), currency)
}

// Every amount draws in `currency` (the Books settings'), not the row's own. A draft and a
// void document show their stored balance. The Category cell names its account or product
// from `categoryNames` (`usePurchaseCategories`).
export function cellText(
    row: DocumentListRow,
    key: ListColumnKey,
    tab: DocumentListTab,
    currency: string,
    categoryNames: CategoryNames = NO_CATEGORY_NAMES
): string {
    switch (key) {
        case 'date':
            return formatDay(row.date)
        case 'type':
            return kindLabel(row.kind)
        case 'number':
            return textOrDash(row.number)
        case 'customer':
        case 'vendor':
            return textOrDash(row.partyName)
        case 'category':
            return categoryText(row.category, categoryNames)
        case 'memo':
            return textOrDash(row.memo)
        case 'reference':
            return textOrDash(row.reference)
        case 'due':
            return dayOrDash(row.dueDate)
        case 'expires':
            return dayOrDash(row.expires)
        case 'balance':
            return formatMoney(row.balance, currency)
        case 'amount':
            return amountOf(row, tab, currency)
        case 'total':
            return amountOf(row, tab, currency)
        case 'status':
            return row.status.label
    }
}

// A cell that draws in muted text: the Category cell of a document with two or more lines
// ("Split"). A name and "—" draw in the foreground.
export function isMutedCell(row: DocumentListRow, key: ListColumnKey): boolean {
    return key === 'category' && row.category.kind === 'split'
}

// The kinds whose card on their own tab shows "Due <date>" after the date.
const CARD_DUE_KINDS: ReadonlySet<DocumentListRow['kind']> = new Set(['invoice', 'bill'])

function cardDue(row: DocumentListRow): string {
    if (!CARD_DUE_KINDS.has(row.kind) || row.dueDate === '') return ''
    return `Due ${formatDay(row.dueDate)}`
}

// A card on a tab of several kinds: type and number, then party and date. A card on a
// kind tab: number and party, then the date (and "Due <date>" for an invoice or a bill). A
// part that is empty (a draft's number, a missing party) is left out, not drawn as "—". A
// card shows no category.
export function cardLines(
    row: DocumentListRow,
    tab: DocumentListTab,
    currency: string
): { title: string; amount: string; detail: string } {
    const amount = amountOf(row, tab, currency)
    const date = formatDay(row.date)
    if (tab.kinds.length > 1) {
        return {
            title: `${kindLabel(row.kind)} ${row.number}`.trim(),
            amount,
            detail: joinShown([row.partyName, date]),
        }
    }
    return {
        title: joinShown([row.number, row.partyName]) || kindLabel(row.kind),
        amount,
        detail: joinShown([date, cardDue(row)]),
    }
}

// A row of the 320 px column beside an open document lists one kind, so its amount is
// positive, but for a refund receipt's or a write-off's, which keeps its minus sign as on
// its tab: number and party, then the amount and the status label.
export function nameRowLines(
    row: DocumentListRow,
    currency: string
): { title: string; amount: string; status: string } {
    const amount = isAlwaysNegative(row)
        ? transactionTotalText(row, currency)
        : formatMoney(Math.abs(row.total), currency)
    return {
        title: joinShown([row.number, row.partyName]) || kindLabel(row.kind),
        amount,
        status: row.status.label,
    }
}

// The flex, minimum width and alignment of a column as the area draws it, for its header
// cell and its row cells. A column with no grow (Status) keeps its fixed width.
export function columnStyle(key: ListColumnKey, area: ListAreaKey): ViewStyle {
    const { minWidth, grow, align } = listColumn(key, area)
    const alignItems = align === 'right' ? 'flex-end' : 'flex-start'
    if (grow === 0) return { width: minWidth, flexShrink: 0, alignItems }
    return { flexGrow: grow, flexShrink: 1, flexBasis: 0, minWidth, alignItems }
}

// Every card has two lines of text, so all cards are one height at a font scale.
export function listCardHeight(_row: DocumentListRow, fontScale: number): number {
    return CARD_PADDING + CARD_TEXT_HEIGHT * fontScale
}
