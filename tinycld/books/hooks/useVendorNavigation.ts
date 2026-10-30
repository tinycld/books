import { VENDORS_PATH } from '../lib/vendor-route'
import { useIsShowingRecord, useRecordNavigation } from './useRecordNavigation'

export function useVendorNavigation() {
    const nav = useRecordNavigation(VENDORS_PATH)
    return {
        open: nav.open,
        // Unwrapped, a press event would reach `openNew(params?)` as route params.
        openNew: () => nav.openNew(),
        leave: nav.leave,
    }
}

export const useIsShowingVendor = () => useIsShowingRecord(VENDORS_PATH)
