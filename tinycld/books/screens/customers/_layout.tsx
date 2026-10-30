import { CustomersList } from '../../components/customers/CustomersList'
import { ListDetailLayout } from '../../components/ListDetailLayout'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { CUSTOMER_DETAIL_SCREENS, CUSTOMERS_PATH } from '../../lib/customer-route'

/**
 * The Customers list — `/a/books/customers` — and the customer open over or beside it.
 *
 * The list renders here, once, so its query, scroll position and search text stay
 * while customers open and close in the child stack. The open customer is read from
 * the URL, never from a store.
 */
export default function CustomersLayout() {
    const { open, openId } = useOpenRecord(CUSTOMERS_PATH)
    return (
        <ListDetailLayout
            list={<CustomersList openId={openId} />}
            isDetailOpen={open.kind !== 'none'}
            detailScreens={CUSTOMER_DETAIL_SCREENS}
        />
    )
}
