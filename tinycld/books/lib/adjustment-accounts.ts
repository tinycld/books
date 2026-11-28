// The inventory adjustment's Adjustment account (inventory-adjust spec §3.2): the accounts
// it may name and its default. The server holds the same rules
// (server/inventory_adjustments.go `adjustmentAccount`: not Accounts receivable or Accounts
// payable, active; `adjustmentStockInputs`: not the inventory asset account of a line's
// item, which for an item with none is the chart's Inventory asset).

import { filteredAccountOptions, type OptionAccount } from './account-options'

export type AdjustmentAccountRow = OptionAccount & { detail_type: string }

const LEDGER_TYPES: ReadonlySet<string> = new Set(['accounts_receivable', 'accounts_payable'])

// The server's order of a control account (server/document_posting.go
// ensureControlAccount): a numbered account first, then by number, then by id.
function controlOrder(a: AdjustmentAccountRow, b: AdjustmentAccountRow): number {
    const aBlank = a.number === '' ? 1 : 0
    const bBlank = b.number === '' ? 1 : 0
    if (aBlank !== bBlank) return aBlank - bBlank
    if (a.number !== b.number) return a.number < b.number ? -1 : 1
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
}

/**
 * The account the server posts to for a detail type when nothing names one: the first
 * active account of that detail type in the server's order; '' when the chart has none
 * (the server then creates it at the post).
 */
export function chartControlAccount(
    accounts: readonly AdjustmentAccountRow[],
    detailType: string
): string {
    const matches = accounts.filter(
        account => !account.inactive && account.detail_type === detailType
    )
    return [...matches].sort(controlOrder)[0]?.id ?? ''
}

/**
 * The inventory asset accounts of the lines' items: each item's own, and the chart's
 * Inventory asset (`chartControlAccount` of 'inventory') for an item that names none.
 */
export function lineAssetAccounts(
    accounts: readonly AdjustmentAccountRow[],
    items: readonly { asset_account: string }[]
): Set<string> {
    const assets = new Set<string>()
    for (const item of items) {
        const id = item.asset_account || chartControlAccount(accounts, 'inventory')
        if (id !== '') assets.add(id)
    }
    return assets
}

/**
 * The Adjustment account's options: every active account except Accounts receivable,
 * Accounts payable and `assets`, in chart order, "<number> <name>", indented by depth. A
 * stored account the list does not offer is named in `triggerLabel` for `storedId`.
 */
export function adjustmentAccountOptions(
    accounts: readonly AdjustmentAccountRow[],
    storedId: string,
    assets: ReadonlySet<string>
) {
    return filteredAccountOptions(
        accounts,
        storedId,
        account => !account.inactive && !LEDGER_TYPES.has(account.type) && !assets.has(account.id)
    )
}
