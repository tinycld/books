import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useLocalSearchParams } from 'expo-router'
import { CustomerChild } from '../../components/customers/CustomerChild'
import { RecordLoadingBody, RecordSurface } from '../../components/RecordSurface'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { usableParentId } from '../../lib/customer-tree'

/**
 * A new customer — `/a/books/customers/new`. `?parent=<id>` makes it a sub-customer,
 * but only when the id names an active top-level customer; any other id is ignored and
 * the Parent customer picker starts at "None (top level)".
 */
export default function NewCustomerScreen() {
    const { parent } = useLocalSearchParams<{ parent?: string }>()
    const [customersCollection] = useStore('books_customers')
    const { record, isLoading } = useRecord(customersCollection, parent)
    const navigation = useCustomerNavigation()
    const surface = useDetailSurface()
    if (!isLoading) {
        return <CustomerChild target={{ mode: 'new', parentId: usableParentId(record) }} />
    }
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix="customer"
            backLabel="Customers"
            title="New customer"
            onLeave={navigation.leave}
            footer={null}
        >
            <RecordLoadingBody testIdPrefix="customer" />
        </RecordSurface>
    )
}
