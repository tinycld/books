import { describe, expect, it } from 'vitest'
import { kindRouteBelowShowing } from '../tinycld/books/lib/stack-screens'

// An inventory adjustment form opened from an item's page (`products/[id]`) goes back to
// that page: a null id matches any record on top of the route below.

type StackState = Parameters<typeof kindRouteBelowShowing>[0]
type StackRoute = StackState['routes'][number]

const products = (top: StackRoute): StackRoute => ({
    key: 'r-products',
    name: 'products',
    state: { routes: [{ key: 'c-index', name: 'index' }, top] },
})

const stateOver = (below: StackRoute): StackState => ({
    routes: [
        { key: 'r-lists', name: 'lists' },
        below,
        {
            key: 'r-adjustments',
            name: 'inventory-adjustments',
            state: { routes: [{ key: 'c-new', name: 'new' }] },
        },
    ],
})

describe('kindRouteBelowShowing with a null id', () => {
    it('matches any record on top of the route below', () => {
        const item = products({ key: 'c-item', name: '[id]', params: { id: 'SHIP-LBL' } })
        expect(kindRouteBelowShowing(stateOver(item), 'r-adjustments', 'products', null)).toBe(1)
    })

    it('gives -1 when the route below shows its list only', () => {
        const list: StackRoute = {
            key: 'r-products',
            name: 'products',
            state: { routes: [{ key: 'c-index', name: 'index' }] },
        }
        expect(kindRouteBelowShowing(stateOver(list), 'r-adjustments', 'products', null)).toBe(-1)
    })

    it('gives -1 when the route below is another route', () => {
        const other: StackRoute = { key: 'r-sales', name: 'sales/index' }
        expect(kindRouteBelowShowing(stateOver(other), 'r-adjustments', 'products', null)).toBe(-1)
    })
})
