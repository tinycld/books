import { describe, expect, it } from 'vitest'
import {
    belowSignature,
    flattenStack,
    kindRouteBelowShowing,
    nestedStack,
    popPlan,
    rootRoutesAbove,
    type StackScreen,
    screensAboveTarget,
    screensBelowRoute,
    screensOfSignature,
} from '../tinycld/books/lib/stack-screens'

// The Books root stack holds one route per sales kind once each kind has a `_layout.tsx`
// (checkpoint 2, Do 9): a document is a route of its kind's child stack. These functions
// give every reader of the stack one flat list of screens named `<root>/<child>`.

// The root state `[sales/index, invoices{index, [id] A}, entries/[id]]`.
const rootState = {
    routes: [
        { key: 'r-sales', name: 'sales/index' },
        {
            key: 'r-invoices',
            name: 'invoices',
            state: {
                routes: [
                    { key: 'c-index', name: 'index' },
                    { key: 'c-a', name: '[id]', params: { id: 'invoiceA0000001' } },
                ],
            },
        },
        { key: 'r-entry', name: 'entries/[id]', params: { id: 'entryE000000001' } },
    ],
}

describe('flattenStack', () => {
    it('gives one screen per child route of a kind route, named <route>/<child>', () => {
        expect(flattenStack(rootState)).toEqual([
            { key: 'r-sales', name: 'sales/index', id: '' },
            { key: 'c-index', name: 'invoices/index', id: '' },
            { key: 'c-a', name: 'invoices/[id]', id: 'invoiceA0000001' },
            { key: 'r-entry', name: 'entries/[id]', id: 'entryE000000001' },
        ])
    })

    it('gives one screen from params.screen and params.params.id when the child state is not there yet', () => {
        const screens = flattenStack({
            routes: [
                { key: 'r-sales', name: 'sales/index' },
                {
                    key: 'r-invoices',
                    name: 'invoices',
                    params: { screen: '[id]', params: { id: 'invoiceA0000001' } },
                },
            ],
        })
        expect(screens).toHaveLength(2)
        expect(screens[1]).toMatchObject({ name: 'invoices/[id]', id: 'invoiceA0000001' })
    })
})

// The purchase kinds (purchase-lists checkpoint 3): each kind route gets a child stack, and
// its screens keep the flat names the root routes have today.
describe('flattenStack over the purchase kind routes', () => {
    it('names the bills child routes bills/index and bills/[id]', () => {
        const screens = flattenStack({
            routes: [
                { key: 'r-purchases', name: 'purchases/index' },
                {
                    key: 'r-bills',
                    name: 'bills',
                    state: {
                        routes: [
                            { key: 'c-index', name: 'index' },
                            { key: 'c-a', name: '[id]', params: { id: 'plbill000001057' } },
                        ],
                    },
                },
            ],
        })
        expect(screens).toEqual([
            { key: 'r-purchases', name: 'purchases/index', id: '' },
            { key: 'c-index', name: 'bills/index', id: '' },
            { key: 'c-a', name: 'bills/[id]', id: 'plbill000001057' },
        ])
    })

    it('names a bill payment opened with no list below it bill-payments/[id]', () => {
        const screens = flattenStack({
            routes: [
                {
                    key: 'r-bill-payments',
                    name: 'bill-payments',
                    state: {
                        routes: [{ key: 'c-p', name: '[id]', params: { id: 'paymentP000001' } }],
                    },
                },
            ],
        })
        expect(screens).toEqual([{ key: 'c-p', name: 'bill-payments/[id]', id: 'paymentP000001' }])
    })
})

// Pay Bills (a root screen) pushed over the bill-payments kind route that shows payment P:
// `[purchases/index, bill-payments{index, [id] P}, pay-bills]`.
// `StackState` is not exported; the parameter type of the function under test is that type.
type StackState = Parameters<typeof kindRouteBelowShowing>[0]
type StackRoute = StackState['routes'][number]

describe('kindRouteBelowShowing', () => {
    const billPayments = (top: StackRoute): StackRoute => ({
        key: 'r-bill-payments',
        name: 'bill-payments',
        state: { routes: [{ key: 'c-index', name: 'index' }, top] },
    })
    const showingP = billPayments({ key: 'c-p', name: '[id]', params: { id: 'paymentP000001' } })
    const stateOver = (below: StackRoute): StackState => ({
        routes: [
            { key: 'r-purchases', name: 'purchases/index' },
            below,
            { key: 'r-pay', name: 'pay-bills' },
        ],
    })

    it('gives the index of the kind route right below when it shows the record on top', () => {
        expect(
            kindRouteBelowShowing(stateOver(showingP), 'r-pay', 'bill-payments', 'paymentP000001')
        ).toBe(1)
    })

    it('gives -1 when the kind route below shows another record', () => {
        expect(
            kindRouteBelowShowing(stateOver(showingP), 'r-pay', 'bill-payments', 'paymentQ000001')
        ).toBe(-1)
    })

    it('gives -1 when the kind route below has its index on top', () => {
        const listOnTop = {
            key: 'r-bill-payments',
            name: 'bill-payments',
            state: { routes: [{ key: 'c-index', name: 'index' }] },
        }
        expect(
            kindRouteBelowShowing(stateOver(listOnTop), 'r-pay', 'bill-payments', 'paymentP000001')
        ).toBe(-1)
    })

    it('gives -1 when the route below is another route', () => {
        const bills = {
            key: 'r-bills',
            name: 'bills',
            state: { routes: [{ key: 'c-b', name: '[id]', params: { id: 'paymentP000001' } }] },
        }
        expect(
            kindRouteBelowShowing(stateOver(bills), 'r-pay', 'bill-payments', 'paymentP000001')
        ).toBe(-1)
    })

    it('gives -1 for the first route and for a key not in the stack', () => {
        const state = { routes: [showingP, { key: 'r-pay', name: 'pay-bills' }] }
        expect(
            kindRouteBelowShowing(state, 'r-bill-payments', 'bill-payments', 'paymentP000001')
        ).toBe(-1)
        expect(kindRouteBelowShowing(state, 'r-missing', 'bill-payments', 'paymentP000001')).toBe(
            -1
        )
    })
})

describe('screensAboveTarget', () => {
    const screens: StackScreen[] = [
        { key: 's0', name: 'sales/index', id: '' },
        { key: 's1', name: 'invoices/[id]', id: 'invoiceA0000001' },
        { key: 's2', name: 'estimates/[id]', id: 'estimateB000001' },
        { key: 's3', name: 'entries/[id]', id: 'entryE000000001' },
    ]

    it('finds an invoice two screens below', () => {
        expect(
            screensAboveTarget(screens, 's3', { name: 'invoices/[id]', id: 'invoiceA0000001' })
        ).toBe(2)
    })

    it('gives 0 when the target is not below', () => {
        expect(
            screensAboveTarget(screens, 's3', { name: 'invoices/[id]', id: 'invoiceZ0000009' })
        ).toBe(0)
        expect(
            screensAboveTarget(screens, 's1', { name: 'entries/[id]', id: 'entryE000000001' })
        ).toBe(0)
    })

    it('gives 0 when the target is not the top screen of its root route', () => {
        // Invoice A is under invoice D in the invoices child stack: a pop would show D.
        const flat = flattenStack({
            routes: [
                { key: 'r-sales', name: 'sales/index' },
                {
                    key: 'r-invoices',
                    name: 'invoices',
                    state: {
                        routes: [
                            { key: 'c-index', name: 'index' },
                            { key: 'c-a', name: '[id]', params: { id: 'invoiceA0000001' } },
                            { key: 'c-d', name: '[id]', params: { id: 'invoiceD0000004' } },
                        ],
                    },
                },
                { key: 'r-entry', name: 'entries/[id]', params: { id: 'entryE000000001' } },
            ],
        })
        expect(
            screensAboveTarget(flat, 'r-entry', { name: 'invoices/[id]', id: 'invoiceA0000001' })
        ).toBe(0)
        expect(
            screensAboveTarget(flat, 'r-entry', { name: 'invoices/[id]', id: 'invoiceD0000004' })
        ).toBe(1)
    })

    it('finds a bill below another root route of the same name', () => {
        // Two separate `bills/[id]` root routes (no child stack): popping B2 shows B1.
        const flat = flattenStack({
            routes: [
                { key: 'r-b1', name: 'bills/[id]', params: { id: 'billB1000000001' } },
                { key: 'r-b2', name: 'bills/[id]', params: { id: 'billB2000000002' } },
                { key: 'r-p', name: 'bill-payments/[id]', params: { id: 'paymentP000001' } },
            ],
        })
        expect(screensAboveTarget(flat, 'r-p', { name: 'bills/[id]', id: 'billB1000000001' })).toBe(
            2
        )
    })
})

// A void bill payment reopened over a copy of itself (purchase-lists cp3 gate 1): the
// original is opened from the entries list, Edit pushes Pay Bills, the save replaces Pay
// Bills with a second `bill-payments` kind route, and search opens the original in it.
// Root stack: `[entries/index, bill-payments#1{[id] A}, bill-payments#2{[id] A}]`.
const reopenedState = {
    routes: [
        { key: 'r-entries', name: 'entries/index' },
        {
            key: 'r-bp1',
            name: 'bill-payments',
            state: { routes: [{ key: 'c-bp1-a', name: '[id]', params: { id: 'paymentA000001' } }] },
        },
        {
            key: 'r-bp2',
            name: 'bill-payments',
            state: { routes: [{ key: 'c-bp2-a', name: '[id]', params: { id: 'paymentA000001' } }] },
        },
    ],
}

describe('screensBelowRoute', () => {
    it('gives every flat screen of the root routes below the kind route, lowest first, with its root route', () => {
        expect(screensBelowRoute(reopenedState, 'r-bp2')).toEqual([
            { name: 'entries/index', id: '', root: 'r-entries' },
            { name: 'bill-payments/[id]', id: 'paymentA000001', root: 'r-bp1' },
        ])
    })

    it('gives every child screen of a kind route below, not only its top one', () => {
        expect(screensBelowRoute(rootState, 'r-entry').map(screen => screen.name)).toEqual([
            'sales/index',
            'invoices/index',
            'invoices/[id]',
        ])
    })

    it('ends with the top child screen of the kind route right below, with its id', () => {
        const state = {
            routes: [
                { key: 'r-sales', name: 'sales/index' },
                {
                    key: 'r-estimates',
                    name: 'estimates',
                    state: {
                        routes: [{ key: 'c-b', name: '[id]', params: { id: 'estimateB000001' } }],
                    },
                },
                {
                    key: 'r-invoices',
                    name: 'invoices',
                    state: { routes: [{ key: 'c-index', name: 'index' }] },
                },
            ],
        }
        expect(screensBelowRoute(state, 'r-invoices')).toEqual([
            { name: 'sales/index', id: '', root: 'r-sales' },
            { name: 'estimates/[id]', id: 'estimateB000001', root: 'r-estimates' },
        ])
    })

    it('gives nothing for the first route or a key not in the stack', () => {
        expect(screensBelowRoute(reopenedState, 'r-entries')).toEqual([])
        expect(screensBelowRoute(reopenedState, 'c-bp2-a')).toEqual([])
    })
})

describe('belowSignature', () => {
    it('reads back as the same screens below', () => {
        expect(screensOfSignature(belowSignature(reopenedState, 'r-bp2'))).toEqual(
            screensBelowRoute(reopenedState, 'r-bp2')
        )
        expect(screensOfSignature(belowSignature(rootState, 'r-entry'))).toEqual(
            screensBelowRoute(rootState, 'r-entry')
        )
    })

    it('is the empty string with nothing below, which reads back as no screens', () => {
        expect(belowSignature(reopenedState, 'r-entries')).toBe('')
        expect(screensOfSignature('')).toEqual([])
    })

    it('stays equal while the screens below do not change', () => {
        const before = belowSignature(reopenedState, 'r-bp2')
        const later = {
            routes: [
                ...reopenedState.routes.slice(0, 2),
                {
                    ...reopenedState.routes[2],
                    state: {
                        routes: [
                            { key: 'c-bp2-z', name: '[id]', params: { id: 'paymentZ000009' } },
                        ],
                    },
                },
            ],
        }
        expect(belowSignature(later, 'r-bp2')).toBe(before)
    })
})

describe('nestedStack', () => {
    const childState = {
        routes: [{ key: 'c-bp2-a', name: '[id]', params: { id: 'paymentA000001' } }],
    }

    it('puts every screen below the kind route first (the nearest keyed below), then the child routes', () => {
        const below = screensBelowRoute(reopenedState, 'r-bp2')
        expect(nestedStack(below, 'bill-payments', childState)).toEqual([
            { key: 'below-1', name: 'entries/index', id: '' },
            { key: 'below', name: 'bill-payments/[id]', id: 'paymentA000001' },
            { key: 'c-bp2-a', name: 'bill-payments/[id]', id: 'paymentA000001' },
        ])
    })

    it('puts one screen below the kind route first, then the child routes named <kindRoute>/<child>', () => {
        const invoices = {
            routes: [
                { key: 'c-index', name: 'index' },
                { key: 'c-a', name: '[id]', params: { id: 'invoiceA0000001' } },
            ],
        }
        const below = [{ name: 'sales/index', id: '', root: 'r-sales' }]
        expect(nestedStack(below, 'invoices', invoices)).toEqual([
            { key: 'below', name: 'sales/index', id: '' },
            { key: 'c-index', name: 'invoices/index', id: '' },
            { key: 'c-a', name: 'invoices/[id]', id: 'invoiceA0000001' },
        ])
        expect(nestedStack([], 'invoices', invoices).map(screen => screen.name)).toEqual([
            'invoices/index',
            'invoices/[id]',
        ])
    })

    it('reaches the entries list past the copy of the read view below the kind route', () => {
        const screens = nestedStack(
            screensBelowRoute(reopenedState, 'r-bp2'),
            'bill-payments',
            childState
        )
        expect(screensAboveTarget(screens, 'c-bp2-a', { name: 'entries/index', id: '' })).toBe(2)
    })

    it('gives 0 for a target under another screen of the same root route below', () => {
        // The invoices list is under invoice A in the invoices route below: a pop would show A.
        const screens = nestedStack(screensBelowRoute(rootState, 'r-entry'), 'entries', {
            routes: [{ key: 'c-e', name: '[id]', params: { id: 'entryE000000001' } }],
        })
        expect(screensAboveTarget(screens, 'c-e', { name: 'invoices/index', id: '' })).toBe(0)
        expect(
            screensAboveTarget(screens, 'c-e', { name: 'invoices/[id]', id: 'invoiceA0000001' })
        ).toBe(1)
    })
})

describe('rootRoutesAbove', () => {
    it('pops both kind routes from the child screen of the second copy to the entries list', () => {
        expect(rootRoutesAbove(reopenedState, 'c-bp2-a', 2)).toBe(2)
    })

    it('pops one kind route from its child screen to the top screen of the route below', () => {
        expect(rootRoutesAbove(reopenedState, 'c-bp2-a', 1)).toBe(1)
    })

    it('counts root routes, not flat screens, from the child screen of a kind route', () => {
        // `[sales/index, invoices{index, [id] A}, entries{[id] E}]`: the sales list is three
        // flat screens below E but only two root routes.
        const state = {
            routes: [
                ...rootState.routes.slice(0, 2),
                {
                    key: 'r-entries',
                    name: 'entries',
                    state: {
                        routes: [{ key: 'c-e', name: '[id]', params: { id: 'entryE000000001' } }],
                    },
                },
            ],
        }
        expect(rootRoutesAbove(state, 'c-e', 3)).toBe(2)
    })

    it('keeps its result for a root route key', () => {
        expect(rootRoutesAbove(rootState, 'r-entry', 3)).toBe(2)
    })
})

describe('popPlan', () => {
    it('pops one own screen of a nested screen with a screen of its stack below', () => {
        expect(popPlan(1, 1, true)).toEqual({ own: 1, kindRoute: false })
    })

    it('pops the kind route when the target is below the kind route', () => {
        expect(popPlan(0, 1, true)).toEqual({ own: 0, kindRoute: true })
        expect(popPlan(1, 2, true)).toEqual({ own: 0, kindRoute: true })
    })

    it('pops own screens on a root screen', () => {
        expect(popPlan(3, 2, false)).toEqual({ own: 2, kindRoute: false })
    })
})
