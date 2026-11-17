import { describe, expect, it } from 'vitest'
import {
    flattenStack,
    nestedScreens,
    popPlan,
    type StackScreen,
    screenBelowRoute,
    screensAboveTarget,
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

describe('screenBelowRoute', () => {
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

    it('gives the top screen of the root route below, with its id', () => {
        expect(screenBelowRoute(state, 'r-invoices')).toEqual({
            name: 'estimates/[id]',
            id: 'estimateB000001',
        })
    })

    it('gives null for the first route', () => {
        expect(screenBelowRoute(state, 'r-sales')).toBeNull()
    })
})

describe('nestedScreens', () => {
    const childState = {
        routes: [
            { key: 'c-index', name: 'index' },
            { key: 'c-a', name: '[id]', params: { id: 'invoiceA0000001' } },
        ],
    }

    it('puts the screen below the kind route first, then the child routes named <kindRoute>/<child>', () => {
        expect(nestedScreens({ name: 'sales/index', id: '' }, 'invoices', childState)).toEqual([
            { key: 'below', name: 'sales/index', id: '' },
            { key: 'c-index', name: 'invoices/index', id: '' },
            { key: 'c-a', name: 'invoices/[id]', id: 'invoiceA0000001' },
        ])
    })

    it('gives only the child routes when nothing is below the kind route', () => {
        expect(nestedScreens(null, 'invoices', childState).map(screen => screen.name)).toEqual([
            'invoices/index',
            'invoices/[id]',
        ])
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
