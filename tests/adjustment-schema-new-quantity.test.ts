import { describe, expect, it } from 'vitest'
import { ADJUSTMENT_MESSAGES, adjustmentSchema } from '../tinycld/books/lib/adjustment-schema'
import type { AdjustmentValues } from '../tinycld/books/lib/adjustment-values'

// New quantity is linked to Change by the form's handlers, which compute Change only from a
// number; a New quantity that is not a number is refused under its own input, so the save
// never writes the Change it left behind.

function valuesWith(newQuantity: string): AdjustmentValues {
    return {
        date: '2026-11-27',
        account: '',
        memo: '',
        lines: [
            {
                id: 'ialnnewqty00001',
                product: 'prodnewqty00001',
                bin: '',
                newQuantity,
                change: '2',
                value: '',
            },
        ],
    }
}

function keysOf(input: AdjustmentValues) {
    const result = adjustmentSchema.safeParse(input)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        key: issue.path.join('.'),
        message: issue.message,
    }))
}

describe('adjustmentSchema: New quantity', () => {
    it('refuses a New quantity that is not a number', () => {
        expect(keysOf(valuesWith('1.2.3'))).toEqual([
            { key: 'lines.0.newQuantity', message: ADJUSTMENT_MESSAGES.quantityMalformed },
        ])
    })

    it('refuses a New quantity with more than 2 decimals, under New quantity, as Change does', () => {
        expect(keysOf(valuesWith('7.555'))).toEqual([
            { key: 'lines.0.newQuantity', message: ADJUSTMENT_MESSAGES.decimals },
        ])
    })

    it('takes a New quantity with 2 decimals', () => {
        expect(keysOf(valuesWith('7.55'))).toEqual([])
    })

    it('takes a number or an empty New quantity', () => {
        expect(keysOf(valuesWith('12'))).toEqual([])
        expect(keysOf(valuesWith(''))).toEqual([])
    })
})
