import { ListDetailLayout } from '../../components/ListDetailLayout'
import { VendorsList } from '../../components/vendors/VendorsList'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { VENDORS_PATH } from '../../lib/vendor-route'

// The vendor routes `[id]` and `new` are not in the child stack yet.
const NO_DETAIL_SCREENS: readonly string[] = []

/**
 * The Vendors list — `/a/books/vendors` — and the vendor open over or beside it.
 *
 * The list renders here, once, so its query, scroll position and search text stay
 * while vendors open and close in the child stack. The open vendor is read from
 * the URL, never from a store.
 */
export default function VendorsLayout() {
    const { open, openId } = useOpenRecord(VENDORS_PATH)
    return (
        <ListDetailLayout
            list={<VendorsList openId={openId} />}
            isDetailOpen={open.kind !== 'none'}
            detailScreens={NO_DETAIL_SCREENS}
        />
    )
}
