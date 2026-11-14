import { CustomersList } from '../../components/customers/CustomersList'
import { ListDetailLayout } from '../../components/ListDetailLayout'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { CUSTOMER_DETAIL_SCREENS, CUSTOMERS_PATH } from '../../lib/customer-route'
import { listLayoutFor } from '../../lib/detail-surface'

/**
 * The Customers list — `/a/books/customers` — and the customer open over or beside it.
 *
 * The list renders here, once, so its query, scroll position and search text stay
 * while customers open and close in the child stack. The open customer is read from
 * the URL, never from a store. On a very wide window an open customer's page fills the
 * row beside a column of names, and a new customer opens in the 480 px panel.
 */
export default function CustomersLayout() {
    const { open, openId } = useOpenRecord(CUSTOMERS_PATH)
    const surface = useDetailSurface()
    const isDetailOpen = open.kind !== 'none'
    const detailWidth = open.kind === 'id' ? 'record' : 'panel'
    const layout = listLayoutFor(surface, detailWidth, isDetailOpen)
    return (
        <ListDetailLayout
            list={<CustomersList openId={openId} layout={layout} />}
            isDetailOpen={isDetailOpen}
            detailScreens={CUSTOMER_DETAIL_SCREENS}
            detailWidth={detailWidth}
        />
    )
}
