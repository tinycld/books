import type { ReactNode } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import type { ProductRecord } from '../../hooks/useProductsQuery'
import {
    PRODUCT_COLUMNS,
    PRODUCT_ROW_HEIGHT,
    productCostText,
    productPriceText,
} from '../../lib/product-list'
import { productTypeLabel } from '../../lib/product-types'
import { InactiveLabel, PartyMenuSlot, selectedProps } from '../party/PartyRowParts'

interface ProductRowProps {
    product: ProductRecord
    // The open product's row on the panel surface.
    isSelected: boolean
    onOpen(id: string): void
    // The row menu, or null for a reader.
    menu: ReactNode
}

function SkuText({ testID, sku }: { testID: string; sku: string | undefined }) {
    if (!sku) return null
    return (
        <Text testID={testID} numberOfLines={1} className="text-xs text-muted-foreground">
            {sku}
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
export function ProductRow({ product, isSelected, onOpen, menu }: ProductRowProps) {
    const { id } = product
    const dim = product.inactive ? 'opacity-60' : ''
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    return (
        <View
            testID={`product-row-${id}`}
            className={`flex-row border-b border-border pr-2 ${bg} ${dim}`}
            style={{ height: PRODUCT_ROW_HEIGHT }}
        >
            <Pressable
                role="button"
                // No label: the platform reads the button's own text (name, SKU, type,
                // prices and the Inactive label), which a label would hide.
                {...selectedProps(isSelected)}
                onPress={() => onOpen(id)}
                className="min-w-0 flex-1 flex-row items-center pl-4"
            >
                <View
                    testID={`product-cell-name-${id}`}
                    className="min-w-0 pr-3"
                    style={PRODUCT_COLUMNS.name}
                >
                    <View className="min-w-0 flex-row items-center">
                        <Text numberOfLines={1} className="shrink text-sm text-foreground">
                            {product.name}
                        </Text>
                        <InactiveLabel isVisible={product.inactive} />
                    </View>
                    <SkuText testID={`product-cell-sku-${id}`} sku={product.sku} />
                </View>
                <View
                    testID={`product-cell-type-${id}`}
                    className="min-w-0 pr-3"
                    style={PRODUCT_COLUMNS.type}
                >
                    <Text numberOfLines={1} className="text-sm text-foreground">
                        {productTypeLabel(product.type)}
                    </Text>
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
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
