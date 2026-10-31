import { View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { type ProductRecord, useProductsQuery } from '../../hooks/useProductsQuery'
import { useRecordList } from '../../hooks/useRecordList'
import { productListCopy } from '../../lib/product-display'
import {
    PRODUCT_COLUMNS,
    PRODUCT_ROW_HEIGHT,
    PRODUCT_TABLE_MIN_WIDTH,
    type ProductListFields,
    productCardHeight,
    productRows,
} from '../../lib/product-list'
import { PRODUCT_LOAD_ERROR } from '../../lib/product-messages'
import { ListCards } from '../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../ListTable'
import { RecordListFrame } from '../RecordListFrame'
import { ProductCard } from './ProductCard'
import { ProductRow } from './ProductRow'

const productKey = (product: ProductListFields) => product.id

const productHeightOf = (product: ProductListFields, fontScale: number) =>
    productCardHeight(product, fontScale)

// The row menu and its delete dialog arrive with the product actions.
const noMenu = () => null

const noop = () => {}

function ProductTableHeader({ testID }: { testID: string }) {
    return (
        <ListHeaderRow testID={testID}>
            <ListHeaderCell label="Name" style={PRODUCT_COLUMNS.name} />
            <ListHeaderCell label="Type" style={PRODUCT_COLUMNS.type} />
            <ListHeaderCell label="Sales price" style={PRODUCT_COLUMNS.price} align="right" />
            <ListHeaderCell label="Cost" style={PRODUCT_COLUMNS.cost} align="right" />
            <View style={PRODUCT_COLUMNS.menu} />
        </ListHeaderRow>
    )
}

// The Products and services list. The open product (`openId`, from the URL) is marked
// on the panel surface, where the list stays in view beside it.
export function ProductsList({ openId }: { openId: string }) {
    const navigation = useProductNavigation()
    const { canWrite } = useBooksAccess()
    const source = useProductsQuery()
    const list = useRecordList(
        { records: source.products, isReady: source.isReady, isError: source.isError },
        productRows
    )
    const loadError = list.viewState === 'error' ? PRODUCT_LOAD_ERROR : null
    // Unwrapped, the press event would reach `openNew(type?)` as the type.
    const openChooser = () => navigation.openNew()
    const renderTable = (selectedId: string) => (
        <ListTable<ProductRecord>
            testID="products-table"
            minWidth={PRODUCT_TABLE_MIN_WIDTH}
            rowHeight={PRODUCT_ROW_HEIGHT}
            header={<ProductTableHeader testID="products-header" />}
            rows={list.rows}
            keyOf={productKey}
            renderRow={product => (
                <ProductRow
                    product={product}
                    isSelected={product.id === selectedId}
                    onOpen={navigation.open}
                    menu={noMenu()}
                />
            )}
        />
    )
    const renderCards = () => (
        <ListCards<ProductRecord>
            testID="products-cards"
            rows={list.rows}
            heightOf={productHeightOf}
            keyOf={productKey}
            renderCard={(product, height) => (
                <ProductCard
                    product={product}
                    height={height}
                    onOpen={navigation.open}
                    menu={noMenu()}
                />
            )}
        />
    )

    return (
        <RecordListFrame
            listPrefix="products"
            recordPrefix="product"
            copy={productListCopy(canWrite)}
            list={list}
            canWrite={canWrite}
            openId={openId}
            onNew={openChooser}
            onRetry={source.retry}
            bannerMessage={loadError}
            isLoadError={loadError !== null}
            onDismissBanner={noop}
            renderTable={renderTable}
            renderCards={renderCards}
            dialog={null}
        />
    )
}
