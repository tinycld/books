export type ItemTab = 'stock' | 'bins' | 'details'

export type ItemTabEntry = { key: ItemTab; label: string; keys: string }

// Every tab of the item page, with its fixed key. A tab shows only once it is in
// ITEM_TAB_ORDER, so a key never moves when a later tab is built.
export const ITEM_TABS: readonly ItemTabEntry[] = [
    { key: 'stock', label: 'Stock', keys: 'Alt+1' },
    { key: 'bins', label: 'Bins', keys: 'Alt+2' },
    { key: 'details', label: 'Details', keys: 'Alt+3' },
]

// The tabs built so far, in strip order; the first is the default (no `tab` param).
export const ITEM_TAB_ORDER: readonly ItemTab[] = ['stock', 'details']

// The tabs the strip draws, in ITEM_TAB_ORDER.
export const SHOWN_ITEM_TABS: readonly ItemTabEntry[] = ITEM_TAB_ORDER.flatMap(key =>
    ITEM_TABS.filter(tab => tab.key === key)
)

// The `tab` search param: a missing, unknown or unbuilt value selects the first tab.
export function itemTabOf(param: string | undefined): ItemTab {
    const shown = ITEM_TAB_ORDER.find(key => key === param)
    return shown ?? ITEM_TAB_ORDER[0] ?? 'stock'
}
