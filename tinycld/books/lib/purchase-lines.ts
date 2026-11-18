// The Purchase lines setting (Settings → Purchases → Bills, expenses and vendor credits,
// books_settings.purchase_lines, expense form spec §3.10, vendor credit spec §3.8) and what
// it decides on the bill, expense and vendor credit forms: the line tables they show and
// Post's line-count text. Plain data
// with type imports only: the bill fixture re-exports from here and the seed graph runs
// in plain node (tests/seed-node.test.ts).

import type { BooksSettings } from '../types'

export type PurchaseLines = BooksSettings['purchase_lines']

export const PURCHASE_LINES_LABELS: Record<PurchaseLines, string> = {
    both: 'Accounts and products',
    accounts: 'Accounts only',
    products: 'Products only',
}

export const PURCHASE_LINES_OPTIONS: { value: PurchaseLines; label: string }[] = (
    ['both', 'accounts', 'products'] as const
).map(value => ({ value, label: PURCHASE_LINES_LABELS[value] }))

export type PurchaseTableKey = 'account_lines' | 'item_lines'

// A purchase kind's tables in form order, and the settings that include each.
const PURCHASE_TABLES: readonly { key: PurchaseTableKey; settings: readonly PurchaseLines[] }[] = [
    { key: 'account_lines', settings: ['both', 'accounts'] },
    { key: 'item_lines', settings: ['both', 'products'] },
]

// A table shows when the setting includes it or the document the form opens with already
// has a line in it, so editing an older document never loses lines. Table order is kept.
export function purchaseTablesShown(
    setting: PurchaseLines,
    lineCounts: Record<PurchaseTableKey, number>
): PurchaseTableKey[] {
    return PURCHASE_TABLES.filter(
        table => table.settings.includes(setting) || lineCounts[table.key] > 0
    ).map(table => table.key)
}

// Post's line-count rule, in the words of the tables the form shows.
export function noLinesText(shown: readonly string[]): string {
    const hasAccounts = shown.includes('account_lines')
    const hasProducts = shown.includes('item_lines')
    if (hasAccounts && !hasProducts) return 'Add at least one account line'
    if (hasProducts && !hasAccounts) return 'Add at least one product line'
    return 'Add at least one account or product line'
}
