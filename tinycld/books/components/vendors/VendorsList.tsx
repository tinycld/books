import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordRowMenus } from '../../hooks/useRecordRowMenus'
import { useVendorActions } from '../../hooks/useVendorActions'
import { useVendorNavigation } from '../../hooks/useVendorNavigation'
import { useVendorsQuery, type VendorRecord } from '../../hooks/useVendorsQuery'
import { partyRows } from '../../lib/party-list'
import {
    RECORD_MENU_LABELS,
    type RecordMenuItem,
    recordMenuItems,
    recordMenuTestIds,
} from '../../lib/record-menu'
import { vendorListCopy } from '../../lib/vendor-display'
import { VENDOR_LOAD_ERROR } from '../../lib/vendor-messages'
import { VENDORS_PATH } from '../../lib/vendor-route'
import { useVendorFormStore } from '../../stores/vendor-form-store'
import { PartyList } from '../party/PartyList'
import { DeleteVendorDialog } from './DeleteVendorDialog'

const VENDOR_MENU = {
    triggerPrefix: 'vendor-menu',
    triggerLabel: 'Vendor actions',
    labels: RECORD_MENU_LABELS,
    testIds: recordMenuTestIds('vendor'),
}

// The Vendors list. The open vendor (`openId`, from the URL) is marked on the panel
// surface, where the list stays in view beside it.
export function VendorsList({ openId }: { openId: string }) {
    const navigation = useVendorNavigation()
    const { canWrite } = useBooksAccess()
    // The one actions instance lives here, so the list's banner and the Delete vendor
    // dialog read the same refusals.
    const actions = useVendorActions()
    const menus = useRecordRowMenus<VendorRecord, RecordMenuItem>({
        actions,
        store: useVendorFormStore,
        openId,
        listPath: VENDORS_PATH,
        navigation,
        canWrite,
        itemsFor: recordMenuItems,
        menu: VENDOR_MENU,
    })
    const source = useVendorsQuery()
    const list = useRecordList(
        { records: source.vendors, isReady: source.isReady, isError: source.isError },
        partyRows
    )
    const loadError = list.viewState === 'error' ? VENDOR_LOAD_ERROR : null
    const dialog = (
        <DeleteVendorDialog
            vendor={menus.deleteDialog.record}
            actions={actions}
            isOpenAndDirty={menus.deleteDialog.isOpenAndDirty}
            refusal={menus.deleteDialog.refusal}
            onClose={menus.deleteDialog.onClose}
            onDeleted={menus.deleteDialog.onDeleted}
        />
    )

    return (
        <PartyList
            listPrefix="vendors"
            recordPrefix="vendor"
            copy={vendorListCopy(canWrite)}
            list={list}
            canWrite={canWrite}
            openId={openId}
            indentPx={0}
            onOpen={navigation.open}
            onNew={navigation.openNew}
            onRetry={source.retry}
            menuFor={menus.menuFor}
            bannerMessage={menus.bannerMessage(loadError)}
            isLoadError={loadError !== null}
            onDismissBanner={menus.dismissRefusal}
            dialog={dialog}
        />
    )
}
