import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useRecordList } from '../../hooks/useRecordList'
import { useVendorNavigation } from '../../hooks/useVendorNavigation'
import { useVendorsQuery } from '../../hooks/useVendorsQuery'
import { partyRows } from '../../lib/party-list'
import { vendorListCopy } from '../../lib/vendor-display'
import { VENDOR_LOAD_ERROR } from '../../lib/vendor-messages'
import { PartyList } from '../party/PartyList'

// No row menus and no refusals to dismiss yet: the row menu cell stays empty.
const noMenu = () => null
const noop = () => {}

// The Vendors list. The open vendor (`openId`, from the URL) is marked on the panel
// surface, where the list stays in view beside it.
export function VendorsList({ openId }: { openId: string }) {
    const navigation = useVendorNavigation()
    const { canWrite } = useBooksAccess()
    const source = useVendorsQuery()
    const list = useRecordList(
        { records: source.vendors, isReady: source.isReady, isError: source.isError },
        partyRows
    )
    const loadError = list.viewState === 'error' ? VENDOR_LOAD_ERROR : null

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
            menuFor={noMenu}
            bannerMessage={loadError}
            isLoadError={loadError !== null}
            onDismissBanner={noop}
            dialog={null}
        />
    )
}
