import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { ListDetailLayout } from '../../components/ListDetailLayout'
import { ProductsList } from '../../components/products/ProductsList'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { listLayoutFor } from '../../lib/detail-surface'
import { PRODUCT_DETAIL_SCREENS, PRODUCTS_PATH } from '../../lib/product-route'

/**
 * The Products and services list — `/a/books/products` — and the product open over or
 * beside it.
 *
 * The list renders here, once, so its query, scroll position and search text stay
 * while products open and close in the child stack. The open product is read from
 * the URL, never from a store. An open Inventory item's page fills the row beside a
 * column of names on a very wide window; every other product, a new product, and a
 * product whose row is still loading open in the 480 px panel.
 */
export default function ProductsLayout() {
    const { open, openId } = useOpenRecord(PRODUCTS_PATH)
    const [productsCollection] = useStore('books_products')
    const { record } = useRecord(productsCollection, openId)
    const surface = useDetailSurface()
    const isDetailOpen = open.kind !== 'none'
    const isItemPage = open.kind === 'id' && record?.type === 'inventory'
    const detailWidth = isItemPage ? 'record' : 'panel'
    const layout = listLayoutFor(surface, detailWidth, isDetailOpen)
    return (
        <ListDetailLayout
            list={<ProductsList openId={openId} layout={layout} />}
            isDetailOpen={isDetailOpen}
            detailScreens={PRODUCT_DETAIL_SCREENS}
            detailWidth={detailWidth}
        />
    )
}
