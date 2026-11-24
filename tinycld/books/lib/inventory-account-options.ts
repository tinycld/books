import { filteredAccountOptions } from './account-options'
import type { ExpenseOptionAccount } from './expense-account-options'

export type AssetOptionAccount = ExpenseOptionAccount

// What the Inventory asset account select shows while the item names no account: the
// name of the account the server gives the item on save (server/stock_posting.go,
// ensureInventoryAsset).
export const ASSET_ACCOUNT_DEFAULT_LABEL = 'Inventory asset'

/**
 * The Inventory asset account choices: the active Other current asset accounts in chart
 * order, indented by depth, with no "None" (the server gives an item with none the
 * chart's Inventory asset account). A stored account that is not offered (it became
 * inactive, or changed type) is named by `triggerLabel`, which the select shows while no
 * option matches its value; it is kept on save.
 */
export function assetAccountOptions(
    accounts: readonly AssetOptionAccount[],
    storedId: string
): { options: { value: string; label: string; indent?: number }[]; triggerLabel: string } {
    return filteredAccountOptions(
        accounts,
        storedId,
        account => account.type === 'other_current_asset'
    )
}

/** The select's text while no option matches: the stored account's name, else the default's. */
export function assetAccountPlaceholder(triggerLabel: string): string {
    return triggerLabel === '' ? ASSET_ACCOUNT_DEFAULT_LABEL : triggerLabel
}
