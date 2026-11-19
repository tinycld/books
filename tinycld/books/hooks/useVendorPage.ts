import { selectVendorTab, VENDOR_TAB_ORDER, vendorPageControls } from '../lib/vendor-page-tabs'
import { VENDORS_PATH } from '../lib/vendor-route'
import { useVendorFormStore } from '../stores/vendor-form-store'
import type { BooksVendors } from '../types'
import { usePartyPage } from './usePartyPage'
import { useVendorActions } from './useVendorActions'
import { useVendorForm, type VendorPageSave } from './useVendorForm'
import { useVendorNavigation } from './useVendorNavigation'

function useVendorDetails(record: BooksVendors, followUps: VendorPageSave) {
    return useVendorForm({ mode: 'edit', record }, followUps)
}

/**
 * The vendor page's state (`usePartyPage`): the vendor's Details form, form store,
 * navigation, list actions and page controls.
 */
export function useVendorPage(record: BooksVendors) {
    const navigation = useVendorNavigation()
    const actions = useVendorActions()
    return usePartyPage({
        party: 'vendor',
        record,
        listPath: VENDORS_PATH,
        tabOrder: VENDOR_TAB_ORDER,
        selectTab: selectVendorTab,
        useDetails: useVendorDetails,
        store: useVendorFormStore,
        navigation,
        actions,
        controlsFor: access => vendorPageControls({ ...access, inactive: record.inactive }),
    })
}

export type VendorPageState = ReturnType<typeof useVendorPage>
