import { useUrl } from '@tinycld/core/lib/use-url'
import { CustomersList } from '../../components/customers/CustomersList'
import { ListDetailLayout } from '../../components/ListDetailLayout'
import { openCustomerFromPath } from '../../lib/customer-route'

/**
 * The Customers list — `/a/books/customers` — and the customer open over or beside it.
 *
 * The list renders here, once, so its query, scroll position and search text stay
 * while customers open and close in the child stack. The open customer is read from
 * the URL, never from a store.
 */
export default function CustomersLayout() {
    const open = openCustomerFromPath(useUrl().pathname)
    const openId = open.kind === 'id' ? open.id : ''
    return (
        <ListDetailLayout
            list={<CustomersList openId={openId} />}
            isDetailOpen={open.kind !== 'none'}
            detailScreens={[]}
        />
    )
}
