import { selectRecordTab } from '../components/RecordTabs'
import { type PartyTab, partyTabOf, shownPartyTabs } from './party-page-tabs'

// The vendor page's tabs built so far, in strip order; the first is the default (no `tab`
// param). A vendor page has no Statements tab: a statement goes to a customer.
export const VENDOR_TAB_ORDER: readonly PartyTab[] = ['contacts', 'details', 'notes']

export const DEFAULT_VENDOR_TAB: PartyTab = VENDOR_TAB_ORDER[0] ?? 'contacts'

// The tabs the strip draws, in VENDOR_TAB_ORDER.
export const SHOWN_VENDOR_TABS = shownPartyTabs(VENDOR_TAB_ORDER)

// The `tab` search param: a missing, unknown or unbuilt value selects the first tab.
export function vendorTabOf(param: string | undefined): PartyTab {
    return partyTabOf(VENDOR_TAB_ORDER, param)
}

// One function for the page's life, so the tab strip's keys stay registered as they are.
export function selectVendorTab(key: PartyTab) {
    selectRecordTab(DEFAULT_VENDOR_TAB, key)
}

export type VendorPageControls = {
    showNewTransaction: boolean
    newTransactionDisabled: boolean
    // Make inactive / Make active in More.
    showInactiveToggle: boolean
    // Delete vendor in More.
    showDelete: boolean
    // Audit history in More.
    showHistory: boolean
}

// What the header offers. Every Books reader gets Audit history, so a reader's More holds
// it alone; a user who cannot read Books, or whose access still loads, gets nothing. Only
// a writer gets the write items and New transaction. Bill, expense, vendor-credit and
// vendor-refund posts refuse an inactive vendor, so New transaction is disabled for one.
export function vendorPageControls({
    canRead,
    canWrite,
    inactive,
}: {
    canRead: boolean
    canWrite: boolean
    inactive: boolean
}): VendorPageControls {
    return {
        showNewTransaction: canWrite,
        newTransactionDisabled: inactive,
        showInactiveToggle: canWrite,
        showDelete: canWrite,
        showHistory: canRead,
    }
}
