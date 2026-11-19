import { selectVendorTab } from '../lib/vendor-page-tabs'
import { VENDORS_PATH } from '../lib/vendor-route'
import { useIsShowingRecord, useRecordNavigation } from './useRecordNavigation'

export function useVendorNavigation() {
    const nav = useRecordNavigation(VENDORS_PATH)
    const isShowing = useIsShowingRecord(VENDORS_PATH)
    return {
        open: nav.open,
        // Unwrapped, a press event would reach `openNew(params?)` as route params.
        openNew: () => nav.openNew(),
        // The vendor's page on its Details tab. The open vendor's page keeps its route
        // and its edits; only its tab changes.
        openDetails: (id: string) => {
            if (isShowing(id)) selectVendorTab('details')
            else nav.openWith(id, { tab: 'details' })
        },
        leave: nav.leave,
    }
}

export const useIsShowingVendor = () => useIsShowingRecord(VENDORS_PATH)
