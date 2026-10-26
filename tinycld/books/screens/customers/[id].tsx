import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useLocalSearchParams } from 'expo-router'
import { CustomerChild } from '../../components/customers/CustomerChild'
import { CustomerNotFound } from '../../components/customers/CustomerNotFound'
import { CustomerLoadingBody, CustomerSurface } from '../../components/customers/CustomerSurface'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useDetailSurface } from '../../hooks/useDetailSurface'

/**
 * One customer — `/a/books/customers/<id>` — over the list (page) or beside it (panel).
 *
 * The record is read live with `useRecord`, so the form follows edits from elsewhere,
 * and a customer deleted elsewhere turns into the not-found message.
 */
export default function CustomerScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const [customersCollection] = useStore('books_customers')
    const { record, isLoading } = useRecord(customersCollection, id)
    const navigation = useCustomerNavigation()
    const surface = useDetailSurface()
    if (record) return <CustomerChild target={{ mode: 'edit', record }} />
    const body = isLoading ? (
        <CustomerLoadingBody />
    ) : (
        <CustomerNotFound onLeave={navigation.leave} />
    )
    return (
        <CustomerSurface
            surface={surface}
            title="Customer"
            onLeave={navigation.leave}
            footer={null}
        >
            {body}
        </CustomerSurface>
    )
}
