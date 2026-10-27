import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useLocalSearchParams } from 'expo-router'
import { CustomerChild } from '../../components/customers/CustomerChild'
import { CustomerNotFound } from '../../components/customers/CustomerNotFound'
import { CustomerLoadingBody, CustomerSurface } from '../../components/customers/CustomerSurface'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useCustomerFormStore } from '../../stores/customer-form-store'

/**
 * One customer — `/a/books/customers/<id>` — over the list (page) or beside it (panel).
 *
 * The record is read live with `useRecord`, so the form follows edits from elsewhere,
 * and a customer deleted elsewhere turns into the not-found message. A delete of this
 * customer from its row menu removes the row before the server answers; until the
 * answer the form stays on the row as it was (the same element, so nothing remounts),
 * so a refusal finds the form and its edits, and a success leaves without a not-found.
 */
export default function CustomerScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const [customersCollection] = useStore('books_customers')
    const { record, isLoading } = useRecord(customersCollection, id)
    const deletingRecord = useCustomerFormStore(s =>
        s.deleting?.id === id ? s.deleting.record : undefined
    )
    const navigation = useCustomerNavigation()
    const surface = useDetailSurface()
    const shown = record ?? deletingRecord
    if (shown) return <CustomerChild target={{ mode: 'edit', record: shown }} />
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
