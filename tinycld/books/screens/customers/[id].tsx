import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useLocalSearchParams } from 'expo-router'
import { CustomerPage } from '../../components/customers/page/CustomerPage'
import { RecordByIdScreen } from '../../components/RecordByIdScreen'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useCodeRouteId } from '../../hooks/useRouteRecordId'
import { useCustomerFormStore } from '../../stores/customer-form-store'
import { useDeletingRecord } from '../../stores/record-form-store'
import type { BooksCustomers } from '../../types'

/**
 * One customer's page — `/a/books/customers/<code>`, an id opens it too — over the list,
 * or beside a column of its names on a very wide window.
 */
export default function CustomerRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useCodeRouteId('books_customers', key)
    if (id === undefined) return null
    return <CustomerScreen key={id} id={id} />
}

function CustomerScreen({ id }: { id: string }) {
    const [customersCollection] = useStore('books_customers')
    const { record, isLoading } = useRecord(customersCollection, id)
    const deletingRecord = useDeletingRecord(useCustomerFormStore, id)
    const navigation = useCustomerNavigation()
    const renderCustomer = (shown: BooksCustomers) => <CustomerPage record={shown} />
    return (
        <RecordByIdScreen
            record={record ?? deletingRecord}
            isLoading={isLoading}
            testIdPrefix="customer"
            backLabel="Customers"
            title="Customer"
            notFoundMessage="This customer doesn't exist or was removed"
            notFoundBackLabel="Back to customers"
            onLeave={navigation.leave}
            renderRecord={renderCustomer}
        />
    )
}
