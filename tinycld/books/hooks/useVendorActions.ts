import { useStore } from '@tinycld/core/lib/pocketbase'
import { useVendorFormStore } from '../stores/vendor-form-store'
import { useRecordActions } from './useRecordActions'
import type { VendorRecord } from './useVendorsQuery'

// Make inactive, Make active and Delete from the Vendors list (`useRecordActions`).
export function useVendorActions() {
    const [vendorsCollection] = useStore('books_vendors')
    return useRecordActions<VendorRecord>({
        setInactive: (id, inactive) =>
            vendorsCollection.update(id, draft => {
                draft.inactive = inactive
            }),
        remove: id => vendorsCollection.delete(id),
        get: id => vendorsCollection.get(id),
        store: useVendorFormStore,
        logContext: 'books.vendors',
    })
}
