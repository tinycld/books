// The text of a sales list's table cells, cards and names-column rows, and the sizes the
// windowed lists draw them at (spec docs/specs/sales-lists-design.md §3 "Rows and
// columns"). The header cell and the row cell share `columnStyle`, so the columns line up.

import type { ViewStyle } from 'react-native'
import {
    type DocumentListRow,
    type DocumentListTab,
    LIST_COLUMNS,
    type ListColumnKey,
} from './document-list'
import { formatMoney } from './money'
import { TRANSACTION_TYPE_LABELS, transactionTotalText } from './party-transactions'
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

// A signed tab (All sales) shows a credit memo's amount negative, with a typographic
// minus; a tab of one kind shows every amount positive.
function amountOf(row: DocumentListRow, tab: DocumentListTab, currency: string): string {
    if (tab.isSigned) return transactionTotalText(row, currency)
    return formatMoney(Math.abs(row.total), currency)
}

// Every amount draws in `currency` (the Books settings'), not the row's own. A draft and a
// void document show their stored balance.
export function cellText(
    row: DocumentListRow,
    key: ListColumnKey,
    tab: DocumentListTab,
    currency: string
): string {
    switch (key) {
        case 'date':
            return formatDay(row.date)
        case 'type':
            return TRANSACTION_TYPE_LABELS[row.kind]
        case 'number':
            return textOrDash(row.number)
        case 'customer':
            return textOrDash(row.customerName)
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
            return formatMoney(Math.abs(row.total), currency)
        case 'status':
            return row.status.label
    }
}

// A card on a tab of several kinds: type and number, then customer and date. A card on a
// kind tab: number and customer, then the date (and "Due <date>" for an invoice). A part
// that is empty (a draft's number, a missing customer) is left out, not drawn as "—".
export function cardLines(
    row: DocumentListRow,
    tab: DocumentListTab,
    currency: string
): { title: string; amount: string; detail: string } {
    const amount = amountOf(row, tab, currency)
    const date = formatDay(row.date)
    if (tab.kinds.length > 1) {
        return {
            title: `${TRANSACTION_TYPE_LABELS[row.kind]} ${row.number}`.trim(),
            amount,
            detail: joinShown([row.customerName, date]),
        }
    }
    const due = row.kind === 'invoice' && row.dueDate !== '' ? `Due ${formatDay(row.dueDate)}` : ''
    return {
        title: joinShown([row.number, row.customerName]) || TRANSACTION_TYPE_LABELS[row.kind],
        amount,
        detail: joinShown([date, due]),
    }
}

// A row of the 320 px column beside an open document lists one kind, so its amount is
// positive: number and customer, then the amount.
export function nameRowLines(
    row: DocumentListRow,
    currency: string
): { title: string; amount: string } {
    return {
        title: joinShown([row.number, row.customerName]) || TRANSACTION_TYPE_LABELS[row.kind],
        amount: formatMoney(Math.abs(row.total), currency),
    }
}

// The flex, minimum width and alignment of a column, for its header cell and its row
// cells. A column with no grow (Status) keeps its fixed width.
export function columnStyle(key: ListColumnKey): ViewStyle {
    const { minWidth, grow, align } = LIST_COLUMNS[key]
    const alignItems = align === 'right' ? 'flex-end' : 'flex-start'
    if (grow === 0) return { width: minWidth, flexShrink: 0, alignItems }
    return { flexGrow: grow, flexShrink: 1, flexBasis: 0, minWidth, alignItems }
}

// Every card has two lines of text, so all cards are one height at a font scale.
export function listCardHeight(_row: DocumentListRow, fontScale: number): number {
    return CARD_PADDING + CARD_TEXT_HEIGHT * fontScale
}
