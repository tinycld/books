import { PARTY_TABS, type PartyTab, partyTabOf, shownPartyTabs } from './party-page-tabs'

export type CustomerTab = PartyTab

// Every tab of the customer page, with its fixed key (the party page's tabs). A tab shows
// only once it is in CUSTOMER_TAB_ORDER, so a key never moves when a later tab is built.
export const CUSTOMER_TABS: readonly { key: CustomerTab; label: string; keys: string }[] =
    PARTY_TABS

// The tabs built so far, in strip order; the first is the default (no `tab` param).
export const CUSTOMER_TAB_ORDER: readonly CustomerTab[] = [
    'transactions',
    'contacts',
    'details',
    'notes',
]

export const DEFAULT_CUSTOMER_TAB: CustomerTab = CUSTOMER_TAB_ORDER[0] ?? 'transactions'

// The tabs the strip draws, in CUSTOMER_TAB_ORDER.
export const SHOWN_CUSTOMER_TABS = shownPartyTabs(CUSTOMER_TAB_ORDER)

// The `tab` search param: a missing, unknown or unbuilt value selects the first tab.
export function customerTabOf(param: string | undefined): CustomerTab {
    return partyTabOf(CUSTOMER_TAB_ORDER, param)
}

export type CustomerPageControls = {
    showMore: boolean
    // Add sub-customer, Make inactive / active and Delete customer in More.
    showWriteItems: boolean
    showAddSub: boolean
    inactiveLabel: 'Make inactive' | 'Make active'
    showNewTransaction: boolean
    newTransactionDisabled: boolean
}

// What the header offers. Every Books reader gets More, which ends with Audit history
// (spec §3 "Entry points"); a user who cannot read Books, or whose access still loads,
// gets none. Only a writer gets its write items and New transaction. Only an active
// top-level customer takes a sub-customer: the server refuses an active sub-customer
// under an inactive parent. Invoice and sales-receipt posts refuse an inactive customer,
// so New transaction is disabled for one.
export function customerPageControls({
    canRead,
    canWrite,
    inactive,
    isTopLevel,
}: {
    canRead: boolean
    canWrite: boolean
    inactive: boolean
    isTopLevel: boolean
}): CustomerPageControls {
    return {
        showMore: canRead,
        showWriteItems: canWrite,
        showAddSub: canWrite && isTopLevel && !inactive,
        inactiveLabel: inactive ? 'Make active' : 'Make inactive',
        showNewTransaction: canWrite,
        newTransactionDisabled: inactive,
    }
}
