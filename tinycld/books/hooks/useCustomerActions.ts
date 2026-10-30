import { useStore } from '@tinycld/core/lib/pocketbase'
import { useCustomerFormStore } from '../stores/customer-form-store'
import type { CustomerRecord } from './useCustomersQuery'
import { useRecordActions } from './useRecordActions'

// Make inactive, Make active and Delete from the Customers list (`useRecordActions`).
export function useCustomerActions() {
    const [customersCollection] = useStore('books_customers')
    return useRecordActions<CustomerRecord>({
        setInactive: (id, inactive) =>
            customersCollection.update(id, draft => {
                draft.inactive = inactive
            }),
        remove: id => customersCollection.delete(id),
        get: id => customersCollection.get(id),
        store: useCustomerFormStore,
        logContext: 'books.customers',
    })
}
