import { describe, expect, it } from 'vitest'
import {
    flattenStack,
    rootRoutesAbove,
    screensAboveTarget,
} from '../tinycld/books/lib/stack-screens'

// A root screen pops root routes, not flat screens: a kind route with a child stack is one
// root route that holds several flat screens (usePopScreens, hooks/useStackScreens.ts).

const state = {
    routes: [
        { key: 'r-sales', name: 'sales/index' },
        {
            key: 'r-invoices',
            name: 'invoices',
            state: { routes: [{ key: 'c-a', name: '[id]', params: { id: 'invoiceA0000001' } }] },
        },
        {
            key: 'r-estimates',
            name: 'estimates',
            state: {
                routes: [
                    { key: 'c-index', name: 'index' },
                    { key: 'c-b', name: '[id]', params: { id: 'estimateB000001' } },
                ],
            },
        },
        { key: 'r-entry', name: 'entries/[id]', params: { id: 'entryE000000001' } },
    ],
}

describe('rootRoutesAbove', () => {
    it('counts the root routes between a root screen and a flat screen below it', () => {
        const count = screensAboveTarget(flattenStack(state), 'r-entry', {
            name: 'invoices/[id]',
            id: 'invoiceA0000001',
        })
        expect(count).toBe(3)
        expect(rootRoutesAbove(state, 'r-entry', count)).toBe(2)
    })

    it('pops one root route to the top screen of the route right below', () => {
        expect(rootRoutesAbove(state, 'r-entry', 1)).toBe(1)
    })
})
