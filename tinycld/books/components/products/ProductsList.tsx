import { View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useListFilters } from '../../hooks/useListFilters'
import { useProductActions } from '../../hooks/useProductActions'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { type ProductRecord, useProductsQuery } from '../../hooks/useProductsQuery'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordRowMenus } from '../../hooks/useRecordRowMenus'
import { productListCopy } from '../../lib/product-display'
import {
    PRODUCT_COLUMNS,
    PRODUCT_ROW_HEIGHT,
    PRODUCT_TABLE_MIN_WIDTH,
    type ProductListFields,
    productCardHeight,
} from '../../lib/product-list'
import { PRODUCT_LOAD_ERROR } from '../../lib/product-messages'
import { PRODUCTS_PATH } from '../../lib/product-route'
import {
    RECORD_MENU_LABELS,
    type RecordMenuItem,
    recordMenuItems,
    recordMenuTestIds,
} from '../../lib/record-menu'
import { useProductFormStore } from '../../stores/product-form-store'
import { ListCards } from '../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../ListTable'
import { RecordListFrame } from '../RecordListFrame'
import { DeleteProductDialog } from './DeleteProductDialog'
import { ProductCard } from './ProductCard'
import { ProductRow } from './ProductRow'

const PRODUCT_MENU = {
    triggerPrefix: 'product-menu',
    triggerLabel: 'Product actions',
    labels: RECORD_MENU_LABELS,
    testIds: recordMenuTestIds('product'),
}

const productKey = (product: ProductListFields) => product.id

const productName = (product: ProductRecord) => product.name

const productHeightOf = (product: ProductListFields, fontScale: number) =>
    productCardHeight(product, fontScale)

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
    // The one actions instance lives here, so the list's banner and the Delete product
    // or service dialog read the same refusals.
    const actions = useProductActions()
    const menus = useRecordRowMenus<ProductRecord, RecordMenuItem>({
        actions,
        store: useProductFormStore,
        openId,
        listPath: PRODUCTS_PATH,
        navigation,
        canWrite,
        itemsFor: recordMenuItems,
        titleOf: productName,
        menu: PRODUCT_MENU,
    })
    const filters = useListFilters()
    const source = useProductsQuery(filters.listFilters)
    const list = useRecordList(filters, source)
    const loadError = list.viewState === 'error' ? PRODUCT_LOAD_ERROR : null
    const dialog = (
        <DeleteProductDialog
            product={menus.deleteDialog.record}
            actions={actions}
            isOpenAndDirty={menus.deleteDialog.isOpenAndDirty}
            refusal={menus.deleteDialog.refusal}
            onClose={menus.deleteDialog.onClose}
            onDeleted={menus.deleteDialog.onDeleted}
        />
    )
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
            onNearEnd={list.onNearEnd}
            renderRow={product => (
                <ProductRow
                    product={product}
                    isSelected={product.id === selectedId}
                    onOpen={navigation.open}
                    menu={menus.menuFor(product)}
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
            onNearEnd={list.onNearEnd}
            renderCard={(product, height) => (
                <ProductCard
                    product={product}
                    height={height}
                    onOpen={navigation.open}
                    menu={menus.menuFor(product)}
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
            bannerMessage={menus.bannerMessage(loadError)}
            isLoadError={loadError !== null}
            onDismissBanner={menus.dismissRefusal}
            renderTable={renderTable}
            renderCards={renderCards}
            dialog={dialog}
        />
    )
}
