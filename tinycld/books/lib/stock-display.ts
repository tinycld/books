// The item page's figures (inventory-adjust spec §3.6 "Figures"): On hand, On PO, Stock
// value, and Average cost or Next cost (FIFO) by the book's costing method ("Cost" with
// "—" while the method is not known). Plain data
// with type imports only.

import type { BooksProducts, BooksStockLayers } from '../types'
import type { CostingMethod } from './costing-method'
import { formatMoney, MINUS, roundHalfAwayFromZero } from './money'

const DASH = '—'

// "36", "18.5", "2.25", "−1.5" (U+2212): at most 2 decimals, no trailing zeros.
export function quantityText(quantity: number): string {
    const text = String(Math.round(Math.abs(quantity) * 100) / 100)
    return quantity < 0 ? `${MINUS}${text}` : text
}

// The stock value over the quantity on hand, in whole cents; null when nothing is on hand.
export function averageCost(stockValue: number, onHand: number): number | null {
    if (onHand <= 0) return null
    return roundHalfAwayFromZero(stockValue / onHand)
}

type Layer = Pick<BooksStockLayers, 'quantity' | 'value'>

// The unit cost of the oldest open layer, in whole cents. The layers come oldest first
// (useStockLayers); a layer with nothing left is not open.
export function nextFifoCost(layers: readonly Layer[]): number | null {
    const open = layers.find(layer => layer.quantity > 0)
    if (!open) return null
    return roundHalfAwayFromZero(open.value / open.quantity)
}

export type ItemFigureKey = 'on_hand' | 'on_po' | 'stock_value' | 'cost'

export type ItemFigure = { key: ItemFigureKey; label: string; text: string; testID: string }

export type ItemFiguresInput = {
    item: Pick<BooksProducts, 'quantity_on_hand' | 'quantity_on_po' | 'stock_value' | 'currency'>
    // Null while the book's costing method is not known (its settings load or failed).
    costing: CostingMethod | null
    layers: readonly Layer[]
}

function costFigure({ item, costing, layers }: ItemFiguresInput): ItemFigure {
    if (costing === null) {
        return { key: 'cost', label: 'Cost', text: DASH, testID: 'item-figure-cost' }
    }
    const cost =
        costing === 'average'
            ? averageCost(item.stock_value, item.quantity_on_hand)
            : nextFifoCost(layers)
    return {
        key: 'cost',
        label: costing === 'average' ? 'Average cost' : 'Next cost (FIFO)',
        text: cost === null ? DASH : formatMoney(cost, item.currency),
        testID: 'item-figure-cost',
    }
}

// The four figures, always in this order.
export function itemFigures(input: ItemFiguresInput): ItemFigure[] {
    const { item } = input
    return [
        {
            key: 'on_hand',
            label: 'On hand',
            text: quantityText(item.quantity_on_hand),
            testID: 'item-figure-on-hand',
        },
        {
            key: 'on_po',
            label: 'On PO',
            text: item.quantity_on_po === 0 ? DASH : quantityText(item.quantity_on_po),
            testID: 'item-figure-on-po',
        },
        {
            key: 'stock_value',
            label: 'Stock value',
            text: formatMoney(item.stock_value, item.currency),
            testID: 'item-figure-stock-value',
        },
        costFigure(input),
    ]
}
