import { describe, expect, it } from 'vitest'
import { adjustmentLineView } from '../tinycld/books/components/inventory-adjustments/AdjustmentLineCells'
import type { AdjustmentLineStock } from '../tinycld/books/hooks/useAdjustmentLineStock'
import type { AdjustmentLineValues } from '../tinycld/books/lib/adjustment-values'

// What a line shows (inventory-adjust spec §3.3): "A line whose Change takes the bin or the
// item below zero shows the hint "Quantity on hand goes below zero."". The bin's quantity
// and the item's total are both checked: an item can hold more in one bin than in all
// (another bin is below zero).

const ITEM = 'prodlineview001'
const BIN = 'binlineview0001'

function stockOf(quantity: number, total: number): AdjustmentLineStock {
    return {
        onHandOf: () => ({ quantity, total }),
        isKnown: product => product === ITEM,
        productOf: () => undefined,
        isReady: true,
        isError: false,
        recovery: { queries: [], sources: [] },
    }
}

function lineWith(change: string): AdjustmentLineValues {
    return { id: 'ialnlineview001', product: ITEM, bin: BIN, newQuantity: '', change, value: '' }
}

function belowZero(change: string, quantity: number, total: number): boolean {
    return adjustmentLineView(lineWith(change), 0, stockOf(quantity, total), {}).isBelowZero
}

describe('adjustmentLineView: the below-zero hint', () => {
    it('shows when the Change takes the item total below zero while the bin stays above', () => {
        // 20 in the bin, 5 in all (another bin holds −15): −10 leaves the bin 10, the item −5.
        expect(belowZero('-10', 20, 5)).toBe(true)
    })

    it('shows when the Change takes the bin below zero', () => {
        expect(belowZero('-5', 3, 40)).toBe(true)
    })

    it('does not show while the bin and the item stay at zero or above', () => {
        expect(belowZero('-10', 20, 30)).toBe(false)
        expect(belowZero('-3', 3, 3)).toBe(false)
    })
})
