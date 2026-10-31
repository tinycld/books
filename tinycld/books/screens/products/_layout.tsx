import { ListDetailLayout } from '../../components/ListDetailLayout'
import { ProductsList } from '../../components/products/ProductsList'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { PRODUCTS_PATH } from '../../lib/product-route'

// The product screens arrive with the product form, so the child stack holds only `index`.
const NO_DETAIL_SCREENS: readonly string[] = []

/**
 * The Products and services list — `/a/books/products` — and the product open over or
 * beside it.
 *
 * The list renders here, once, so its query, scroll position and search text stay
 * while products open and close in the child stack. The open product is read from
 * the URL, never from a store.
 */
export default function ProductsLayout() {
    const { open, openId } = useOpenRecord(PRODUCTS_PATH)
    return (
        <ListDetailLayout
            list={<ProductsList openId={openId} />}
            isDetailOpen={open.kind !== 'none'}
            detailScreens={NO_DETAIL_SCREENS}
        />
    )
}
