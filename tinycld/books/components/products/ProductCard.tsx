import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ProductRecord } from '../../hooks/useProductsQuery'
import { productShowsLowBadge, productTypeLine } from '../../lib/product-list'
import { InactiveLabel, MutedLine, PartyMenuSlot, selectedProps } from '../party/PartyRowParts'
import { StatusBadge } from '../StatusBadge'

interface ProductCardProps {
    product: ProductRecord
    height: number
    // True for the open product on the panel surface; the phone path passes false.
    isSelected: boolean
    onOpen(id: string): void
    // The row menu, or null for a reader.
    menu: ReactNode
}

// The Low stock badge of a low Inventory item, on line 1 (inventory-adjust spec §3.10).
function LowStockBadge({ isVisible, id }: { isVisible: boolean; id: string }) {
    if (!isVisible) return null
    return (
        <View className="ml-2 shrink-0">
            <StatusBadge label="Low stock" tone="warning" testID={`product-card-low-${id}`} />
        </View>
    )
}

// Drawn at exactly `height`, the productCardHeight the windowed card list sizes its
// spacers by (the badge line included). Like a table row, the open button and the menu
// are siblings. The open product is marked as ProductRow marks it (`bg-accent` and
// selectedProps).
export function ProductCard({ product, height, isSelected, onOpen, menu }: ProductCardProps) {
    const dim = product.inactive ? 'opacity-60' : ''
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    const isLow = productShowsLowBadge(product)
    const typeLine = productTypeLine(product)
    return (
        <View
            testID={`product-card-${product.id}`}
            className={`flex-row border-b border-border pr-2 ${bg} ${dim}`}
            style={{ height }}
        >
            <Pressable
                role="button"
                {...selectedProps(isSelected)}
                onPress={() => onOpen(product.id)}
                className="min-w-0 flex-1 justify-center pl-4"
            >
                <View className="min-w-0 flex-row items-center">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {product.name}
                    </Text>
                    <InactiveLabel isVisible={product.inactive} />
                    <LowStockBadge isVisible={isLow} id={product.id} />
                </View>
                <MutedLine testID={`product-code-${product.id}`} value={product.code} />
                <MutedLine value={typeLine} />
                <MutedLine value={product.vendor_part_no} />
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
