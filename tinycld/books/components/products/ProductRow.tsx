import type { ReactNode } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import type { ProductRecord } from '../../hooks/useProductsQuery'
import {
    PRODUCT_COLUMNS,
    PRODUCT_ROW_HEIGHT,
    productCostText,
    productPriceText,
    productStockLine,
} from '../../lib/product-list'
import { productTypeLabel } from '../../lib/product-types'
import { InactiveLabel, PartyMenuSlot, selectedProps } from '../party/PartyRowParts'

interface ProductRowProps {
    product: ProductRecord
    // The open product's row on the panel surface.
    isSelected: boolean
    onOpen(id: string): void
    // The row menu, or null for a reader and in a name-only row.
    menu: ReactNode
    // Beside an Inventory item's page the list shows the names only.
    isNameOnly: boolean
}

const NAME_ONLY_CELL = { flex: 1, minWidth: 0 } as const

function CodeCell({ isVisible, product }: { isVisible: boolean; product: ProductRecord }) {
    if (!isVisible) return null
    return (
        <View
            testID={`product-cell-code-${product.id}`}
            className="min-w-0 pr-3"
            style={PRODUCT_COLUMNS.code}
        >
            <Text numberOfLines={1} className="text-sm tabular-nums text-muted-foreground">
                {product.code}
            </Text>
        </View>
    )
}

const STOCK_TONE_CLASS = {
    muted: 'text-xs text-muted-foreground',
    warning: 'text-xs text-warning',
} as const

// An Inventory row's stock under its type (productStockLine): it fits the 56 px row
// beside the 20 px type line, so the row and the column keep their sizes.
function StockLine({ product }: { product: ProductRecord }) {
    const line = productStockLine(product)
    if (line === null) return null
    const toneClass = STOCK_TONE_CLASS[line.tone]
    return (
        <Text testID={`product-cell-stock-${product.id}`} numberOfLines={1} className={toneClass}>
            {line.text}
        </Text>
    )
}

// Type, Sales price and Cost.
function DetailCells({ isVisible, product }: { isVisible: boolean; product: ProductRecord }) {
    if (!isVisible) return null
    const { id } = product
    return (
        <>
            <View
                testID={`product-cell-type-${id}`}
                className="min-w-0 pr-3"
                style={PRODUCT_COLUMNS.type}
            >
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {productTypeLabel(product.type)}
                </Text>
                <StockLine product={product} />
            </View>
            <MoneyCell
                testID={`product-cell-price-${id}`}
                text={productPriceText(product)}
                style={PRODUCT_COLUMNS.price}
            />
            <MoneyCell
                testID={`product-cell-cost-${id}`}
                text={productCostText(product)}
                style={PRODUCT_COLUMNS.cost}
            />
        </>
    )
}

function MenuCell({ isVisible, menu }: { isVisible: boolean; menu: ReactNode }) {
    if (!isVisible) return null
    return <PartyMenuSlot menu={menu} />
}

function VendorPartNoText({ testID, partNo }: { testID: string; partNo: string | undefined }) {
    if (!partNo) return null
    return (
        <Text testID={testID} numberOfLines={1} className="text-xs text-muted-foreground">
            {partNo}
        </Text>
    )
}

function MoneyCell({ testID, text, style }: { testID: string; text: string; style: ViewStyle }) {
    return (
        <View testID={testID} className="pr-3" style={style}>
            <Text numberOfLines={1} className="text-right text-sm tabular-nums text-foreground">
                {text}
            </Text>
        </View>
    )
}

// Two siblings in a row: the button that opens the product (its cells) and the menu.
// Neither is inside the other, so each is its own control for a screen reader, and a
// press on the menu or one of its items never reaches the open button.
export function ProductRow({ product, isSelected, onOpen, menu, isNameOnly }: ProductRowProps) {
    const { id } = product
    const dim = product.inactive ? 'opacity-60' : ''
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    const nameStyle = isNameOnly ? NAME_ONLY_CELL : PRODUCT_COLUMNS.name
    return (
        <View
            testID={`product-row-${id}`}
            className={`flex-row border-b border-border pr-2 ${bg} ${dim}`}
            style={{ height: PRODUCT_ROW_HEIGHT }}
        >
            <Pressable
                role="button"
                // No label: the platform reads the button's own text (code, name, vendor part number, type,
                // prices and the Inactive label), which a label would hide.
                {...selectedProps(isSelected)}
                onPress={() => onOpen(id)}
                className="min-w-0 flex-1 flex-row items-center pl-4"
            >
                <CodeCell isVisible={!isNameOnly} product={product} />
                <View testID={`product-cell-name-${id}`} className="min-w-0 pr-3" style={nameStyle}>
                    <View className="min-w-0 flex-row items-center">
                        <Text numberOfLines={1} className="shrink text-sm text-foreground">
                            {product.name}
                        </Text>
                        <InactiveLabel isVisible={product.inactive} />
                    </View>
                    <VendorPartNoText
                        testID={`product-cell-vendor-part-no-${id}`}
                        partNo={product.vendor_part_no}
                    />
                </View>
                <DetailCells isVisible={!isNameOnly} product={product} />
            </Pressable>
            <MenuCell isVisible={!isNameOnly} menu={menu} />
        </View>
    )
}
