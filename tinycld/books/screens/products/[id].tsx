import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useLocalSearchParams } from 'expo-router'
import { ProductChild } from '../../components/products/ProductChild'
import { RecordByIdScreen } from '../../components/RecordByIdScreen'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { PRODUCT_NOT_FOUND } from '../../lib/product-messages'
import { useProductFormStore } from '../../stores/product-form-store'
import { useDeletingRecord } from '../../stores/record-form-store'
import type { BooksProducts } from '../../types'

/** One product — `/a/books/products/<id>` — to edit or view, over the list or beside it. */
export default function ProductScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const [productsCollection] = useStore('books_products')
    const { record, isLoading } = useRecord(productsCollection, id)
    const deletingRecord = useDeletingRecord(useProductFormStore, id)
    const { leave } = useProductNavigation()
    const renderProduct = (shown: BooksProducts) => (
        <ProductChild target={{ mode: 'edit', record: shown }} />
    )
    return (
        <RecordByIdScreen
            record={record ?? deletingRecord}
            isLoading={isLoading}
            testIdPrefix="product"
            backLabel="Products and services"
            title="Product or service"
            notFoundMessage={PRODUCT_NOT_FOUND}
            notFoundBackLabel="Back to products and services"
            onLeave={leave}
            renderRecord={renderProduct}
        />
    )
}
