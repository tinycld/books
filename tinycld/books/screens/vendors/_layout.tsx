import { ListDetailLayout } from '../../components/ListDetailLayout'
import { VendorsList } from '../../components/vendors/VendorsList'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { listLayoutFor } from '../../lib/detail-surface'
import { VENDOR_DETAIL_SCREENS, VENDORS_PATH } from '../../lib/vendor-route'

/**
 * The Vendors list — `/a/books/vendors` — and the vendor open over or beside it.
 *
 * The list renders here, once, so its query, scroll position and search text stay
 * while vendors open and close in the child stack. The open vendor is read from
 * the URL, never from a store. On a very wide window an open vendor's page fills the
 * row beside a column of names, and a new vendor opens in the 480 px panel.
 */
export default function VendorsLayout() {
    const { open, openId } = useOpenRecord(VENDORS_PATH)
    const surface = useDetailSurface()
    const isDetailOpen = open.kind !== 'none'
    const detailWidth = open.kind === 'id' ? 'record' : 'panel'
    const layout = listLayoutFor(surface, detailWidth, isDetailOpen)
    return (
        <ListDetailLayout
            list={<VendorsList openId={openId} layout={layout} />}
            isDetailOpen={isDetailOpen}
            detailScreens={VENDOR_DETAIL_SCREENS}
            detailWidth={detailWidth}
        />
    )
}
