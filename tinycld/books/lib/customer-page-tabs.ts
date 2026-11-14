export type CustomerTab = 'transactions' | 'contacts' | 'details' | 'notes'

// Every tab of the customer page, with its fixed key. A tab shows only once it is in
// CUSTOMER_TAB_ORDER, so a key never moves when a later tab is built.
export const CUSTOMER_TABS: readonly { key: CustomerTab; label: string; keys: string }[] = [
    { key: 'transactions', label: 'Transactions', keys: 'Alt+1' },
    { key: 'contacts', label: 'Contacts', keys: 'Alt+2' },
    { key: 'details', label: 'Details', keys: 'Alt+3' },
    { key: 'notes', label: 'Notes', keys: 'Alt+4' },
]

// The tabs built so far, in strip order; the first is the default (no `tab` param).
export const CUSTOMER_TAB_ORDER: readonly CustomerTab[] = ['transactions', 'details', 'notes']

export const DEFAULT_CUSTOMER_TAB: CustomerTab = CUSTOMER_TAB_ORDER[0] ?? 'transactions'

// The tabs the strip draws, in CUSTOMER_TAB_ORDER.
export const SHOWN_CUSTOMER_TABS = CUSTOMER_TAB_ORDER.flatMap(key =>
    CUSTOMER_TABS.filter(tab => tab.key === key)
)

function isShownTab(value: string): value is CustomerTab {
    return (CUSTOMER_TAB_ORDER as readonly string[]).includes(value)
}

// The `tab` search param: a missing, unknown or unbuilt value selects the first tab.
export function customerTabOf(param: string | undefined): CustomerTab {
    if (param === undefined || !isShownTab(param)) return DEFAULT_CUSTOMER_TAB
    return param
}

export type CustomerPageControls = {
    showMore: boolean
    showAddSub: boolean
    inactiveLabel: 'Make inactive' | 'Make active'
    showNewTransaction: boolean
    newTransactionDisabled: boolean
}

// What the header offers. A reader gets no More menu and no New transaction. Only an
// active top-level customer takes a sub-customer: the server refuses an active
// sub-customer under an inactive parent. Invoice and sales-receipt posts refuse an
// inactive customer, so New transaction is disabled for one.
export function customerPageControls({
    canWrite,
    inactive,
    isTopLevel,
}: {
    canWrite: boolean
    inactive: boolean
    isTopLevel: boolean
}): CustomerPageControls {
    return {
        showMore: canWrite,
        showAddSub: canWrite && isTopLevel && !inactive,
        inactiveLabel: inactive ? 'Make active' : 'Make inactive',
        showNewTransaction: canWrite,
        newTransactionDisabled: inactive,
    }
}
