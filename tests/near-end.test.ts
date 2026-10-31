import { describe, expect, it } from 'vitest'
import { isNearEnd, NEAR_END_PX } from '../tinycld/books/lib/near-end'

const at = (y: number) => ({
    contentOffset: { y },
    layoutMeasurement: { height: 800 },
    contentSize: { height: 2800 },
})

describe('isNearEnd', () => {
    it('is false at the top of a long list', () => {
        expect(isNearEnd(at(0))).toBe(false)
    })

    it('turns true within NEAR_END_PX of the end', () => {
        expect(isNearEnd(at(2800 - 800 - NEAR_END_PX - 1))).toBe(false)
        expect(isNearEnd(at(2800 - 800 - NEAR_END_PX))).toBe(true)
        expect(isNearEnd(at(2000))).toBe(true)
    })

    it('is true for a list shorter than its view', () => {
        expect(
            isNearEnd({
                contentOffset: { y: 0 },
                layoutMeasurement: { height: 800 },
                contentSize: { height: 300 },
            })
        ).toBe(true)
    })
})
