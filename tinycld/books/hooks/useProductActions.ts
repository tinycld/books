import { useStore } from '@tinycld/core/lib/pocketbase'
import { useProductFormStore } from '../stores/product-form-store'
import type { ProductRecord } from './useProductsQuery'
import { useRecordActions } from './useRecordActions'

// Make inactive, Make active and Delete from the Products and services list
// (`useRecordActions`).
export function useProductActions() {
    const [productsCollection] = useStore('books_products')
    return useRecordActions<ProductRecord>({
        setInactive: (id, inactive) =>
            productsCollection.update(id, draft => {
                draft.inactive = inactive
            }),
        remove: id => productsCollection.delete(id),
        get: id => productsCollection.get(id),
        store: useProductFormStore,
        logContext: 'books.products',
    })
}
