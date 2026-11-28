import { View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useListFilters } from '../../hooks/useListFilters'
import { useProductActions } from '../../hooks/useProductActions'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { type ProductRecord, useProductsQuery } from '../../hooks/useProductsQuery'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordRowMenus } from '../../hooks/useRecordRowMenus'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import { type ListLayout, RECORD_LIST_WIDTH } from '../../lib/detail-surface'
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
import { SALES_BY_PRODUCT_SHIPPED_KEY } from '../../lib/shipped-reports'
import { useProductFormStore } from '../../stores/product-form-store'
import { ListCards } from '../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../ListTable'
import { RecordListFrame } from '../RecordListFrame'
import { ShippedReportButton } from '../reports/ShippedReportButton'
import { DeleteProductDialog } from './DeleteProductDialog'
import { InventoryTabStrip } from './InventoryTabStrip'
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

const NAME_ONLY_CELL = { flex: 1, minWidth: 0 } as const

function ProductTableHeader({ testID, isNameOnly }: { testID: string; isNameOnly: boolean }) {
    if (isNameOnly) {
        return (
            <ListHeaderRow testID={testID}>
                <ListHeaderCell label="Name" style={NAME_ONLY_CELL} />
            </ListHeaderRow>
        )
    }
    return (
        <ListHeaderRow testID={testID}>
            <ListHeaderCell label="Code" style={PRODUCT_COLUMNS.code} />
            <ListHeaderCell label="Name" style={PRODUCT_COLUMNS.name} />
            <ListHeaderCell label="Type" style={PRODUCT_COLUMNS.type} />
            <ListHeaderCell label="Sales price" style={PRODUCT_COLUMNS.price} align="right" />
            <ListHeaderCell label="Cost" style={PRODUCT_COLUMNS.cost} align="right" />
            <View style={PRODUCT_COLUMNS.menu} />
        </ListHeaderRow>
    )
}

// The Products and services list. The open product (`openId`, from the URL) is marked
// on the panel surface, where the list stays in view beside it; beside an Inventory
// item's page it shows the names only (`layout`).
export function ProductsList({ openId, layout }: { openId: string; layout: ListLayout }) {
    const isNameOnly = layout === 'names'
    const tableMinWidth = isNameOnly ? RECORD_LIST_WIDTH : PRODUCT_TABLE_MIN_WIDTH
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
    // A name-only row draws no menu, so it asks for none.
    const menuOf = (product: ProductRecord) => (isNameOnly ? null : menus.menuFor(product))
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
    // Null while the report loads, when its read fails and when the reader has none: the
    // list then shows no button and stays usable; the live query shows it once it loads.
    const salesHref = useShippedReportHref(SALES_BY_PRODUCT_SHIPPED_KEY)
    // Undefined, not a button that renders null, so the header draws no empty button group.
    const salesButton =
        salesHref === null ? undefined : (
            <ShippedReportButton
                href={salesHref}
                label="Sales report"
                testID="products-sales-report"
            />
        )
    // Unwrapped, the press event would reach `openNew(type?)` as the type.
    const openChooser = () => navigation.openNew()
    const renderTable = (selectedId: string) => (
        <ListTable<ProductRecord>
            testID="products-table"
            minWidth={tableMinWidth}
            rowHeight={PRODUCT_ROW_HEIGHT}
            header={<ProductTableHeader testID="products-header" isNameOnly={isNameOnly} />}
            rows={list.rows}
            keyOf={productKey}
            onNearEnd={list.onNearEnd}
            renderRow={product => (
                <ProductRow
                    product={product}
                    isSelected={product.id === selectedId}
                    onOpen={navigation.open}
                    menu={menuOf(product)}
                    isNameOnly={isNameOnly}
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
            headerAction={salesButton}
            tabs={<InventoryTabStrip selected="products" />}
        />
    )
}
