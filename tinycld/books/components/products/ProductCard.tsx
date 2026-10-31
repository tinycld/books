import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ProductRecord } from '../../hooks/useProductsQuery'
import { productTypeLine } from '../../lib/product-list'
import { InactiveLabel, MutedLine, PartyMenuSlot } from '../party/PartyRowParts'

interface ProductCardProps {
    product: ProductRecord
    height: number
    onOpen(id: string): void
    // The row menu, or null for a reader.
    menu: ReactNode
}

// Drawn at exactly `height`, the productCardHeight the windowed card list sizes its
// spacers by. Like a table row, the open button and the menu are siblings.
export function ProductCard({ product, height, onOpen, menu }: ProductCardProps) {
    const dim = product.inactive ? 'opacity-60' : ''
    return (
        <View
            testID={`product-card-${product.id}`}
            className={`flex-row border-b border-border bg-background pr-2 ${dim}`}
            style={{ height }}
        >
            <Pressable
                role="button"
                onPress={() => onOpen(product.id)}
                className="min-w-0 flex-1 justify-center pl-4"
            >
                <View className="min-w-0 flex-row items-center">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {product.name}
                    </Text>
                    <InactiveLabel isVisible={product.inactive} />
                </View>
                <MutedLine value={productTypeLine(product)} />
                <MutedLine value={product.sku} />
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
