// The Books stack as one flat list of screens (sales-lists checkpoint 2). Each sales kind
// route (`invoices`, `estimates`, …) has a `_layout.tsx`, so the Books root stack holds one
// route per kind and the kind's `index`, `new` and `[id]` screens are routes of its child
// stack. Every reader of the stack works on flat screens whose names join the root route
// and the child route with a slash (`invoices/[id]`): the names the root routes had before
// the kind routes had a layout, which `popDepth`, `backTarget` and `isReadOnlyRoute` match.
// Pure, so each rule is unit-tested; hooks/useStackScreens.ts reads the live state.

import { recordIdForKey } from '../stores/route-key-store'

// `id` is the record id: a document route's URL key may be its number, which
// recordIdForKey turns into the id the route read.
export type StackScreen = { key: string; name: string; id: string }

// The parts of a navigation state these functions read. A nested state that is not built
// yet (a partial state) may have routes with no key.
type StackRoute = {
    key?: string
    name: string
    params?: object
    state?: StackState
}

type StackState = { routes: readonly StackRoute[] }

type ScreenRef = { name: string; id: string }

function idOf(params: object | undefined): string {
    if (params === undefined || !('id' in params)) return ''
    return typeof params.id === 'string' ? params.id : ''
}

// The child screen a nested route was pushed with, before its own state is set:
// `params.screen` and that screen's `params.params.id`.
function pendingChild(params: object | undefined): ScreenRef | null {
    if (params === undefined || !('screen' in params) || typeof params.screen !== 'string') {
        return null
    }
    const inner = 'params' in params && typeof params.params === 'object' ? params.params : null
    return { name: params.screen, id: idOf(inner ?? undefined) }
}

// The root route each flat screen that these functions build belongs to (its key), so two
// root routes with the same name (two `bills/[id]` routes, or two `invoices` kind routes)
// are told apart. It is kept by screen object, so a flat screen keeps its three fields. A
// screen built elsewhere is in no map entry and counts as its own root route.
const rootRouteOf = new WeakMap<StackScreen, string>()

function inRootRoute(screen: StackScreen, rootKey: string): StackScreen {
    rootRouteOf.set(screen, rootKey)
    return screen
}

function sameRootRoute(a: StackScreen, b: StackScreen): boolean {
    const root = rootRouteOf.get(a)
    return root !== undefined && root === rootRouteOf.get(b)
}

function childScreens(parentName: string, parentKey: string, state: StackState): StackScreen[] {
    return state.routes.map((child, index) =>
        inRootRoute(
            {
                key: child.key ?? `${parentKey}-${index}`,
                name: `${parentName}/${child.name}`,
                id: recordIdForKey(`${parentName}/${child.name}`, idOf(child.params)),
            },
            parentKey
        )
    )
}

function screensOfRoute(route: StackRoute, index: number): StackScreen[] {
    const key = route.key ?? `root-${index}`
    if (route.state !== undefined) return childScreens(route.name, key, route.state)
    const pending = pendingChild(route.params)
    const name = pending === null ? route.name : `${route.name}/${pending.name}`
    const urlKey = pending === null ? idOf(route.params) : pending.id
    const screen = { key, name, id: recordIdForKey(name, urlKey) }
    return [inRootRoute(screen, key)]
}

// A route with a nested state gives one screen per child route, named `<route>/<child>`,
// with the child's key and `params.id`; a nested route whose state is not set yet gives
// one screen from `params.screen`; any other route gives itself.
export function flattenStack(state: StackState): StackScreen[] {
    return state.routes.flatMap(screensOfRoute)
}

// A flat screen below a kind route, with the key of the root route it belongs to.
export type BelowScreen = ScreenRef & { root: string }

// Every flat screen of the root routes below `routeKey`, lowest first; empty when
// `routeKey` is the first route (or not in the stack).
export function screensBelowRoute(state: StackState, routeKey: string): BelowScreen[] {
    const index = state.routes.findIndex(route => route.key === routeKey)
    if (index <= 0) return []
    return state.routes.slice(0, index).flatMap((route, routeIndex) =>
        screensOfRoute(route, routeIndex).map(screen => ({
            name: screen.name,
            id: screen.id,
            root: route.key ?? `root-${routeIndex}`,
        }))
    )
}

// The index of the root route right below `routeKey` when it is the kind route `kindRoute`
// with the record `id` on top of its child stack (`<kindRoute>/[id]`); -1 otherwise.
export function kindRouteBelowShowing(
    state: StackState,
    routeKey: string,
    kindRoute: string,
    id: string
): number {
    const below = state.routes.findIndex(route => route.key === routeKey) - 1
    if (below < 0) return -1
    const route = state.routes[below]
    if (route.name !== kindRoute) return -1
    const top = screensOfRoute(route, below).at(-1)
    return top?.name === `${kindRoute}/[id]` && top.id === id ? below : -1
}

// screensBelowRoute as one string, so a navigation-state selector returns a value that
// stays equal between renders while the screens below do not change. Route keys, route
// names and record ids hold no tab or line break.
export function belowSignature(state: StackState, routeKey: string): string {
    return screensBelowRoute(state, routeKey)
        .map(screen => `${screen.root}\t${screen.name}\t${screen.id}`)
        .join('\n')
}

export function screensOfSignature(signature: string): BelowScreen[] {
    if (signature === '') return []
    return signature.split('\n').map(line => {
        const [root = '', name = '', id = ''] = line.split('\t')
        return { root, name, id }
    })
}

/**
 * What a screen of a kind's child stack sees: every flat screen below the kind route
 * (lowest first; the nearest has the key `below`, the others `below-<distance>`), then the
 * child routes named `<kindRoute>/<child>`. The screens below keep their root routes, so
 * screensAboveTarget tells two screens of one root route below from two root routes.
 */
export function nestedStack(
    below: readonly BelowScreen[],
    kindRoute: string,
    childState: StackState
): StackScreen[] {
    const nearest = below.length - 1
    const belowScreens = below.map((screen, index) =>
        inRootRoute(
            {
                key: index === nearest ? 'below' : `below-${nearest - index}`,
                name: screen.name,
                id: screen.id,
            },
            `below:${screen.root}`
        )
    )
    return [...belowScreens, ...childScreens(kindRoute, kindRoute, childState)]
}

/**
 * How many screens to pop from `key` to show the screen `target`: the last screen below
 * `key` with the target's name and id. 0 when it is not below, or when it is not the top
 * screen of its root route (a screen of the same child stack lies above it, so a pop would
 * show that one). Two root routes are told apart by their keys, not their names.
 * Pass the screen objects that `flattenStack` / `nestedStack` return, unmapped: the root
 * route of each is looked up by object, so a copied screen counts as its own root route.
 */
export function screensAboveTarget(
    screens: readonly StackScreen[],
    key: string,
    target: ScreenRef
): number {
    const index = screens.findIndex(screen => screen.key === key)
    if (index <= 0) return 0
    const found = screens
        .slice(0, index)
        .findLastIndex(screen => screen.name === target.name && screen.id === target.id)
    if (found < 0) return 0
    if (found + 1 < index && sameRootRoute(screens[found], screens[found + 1])) return 0
    return index - found
}

/**
 * How a screen pops `count` screens. `ownIndex` is its index in its own stack. A screen of
 * a kind's child stack whose target lies below the kind route pops root routes from the
 * root stack, the kind route first (rootRoutesAbove; a pop inside a child stack never
 * removes its first route); otherwise the screen pops `count` screens of its own stack.
 */
export function popPlan(
    ownIndex: number,
    count: number,
    isNested: boolean
): { own: number; kindRoute: boolean } {
    if (isNested && count > ownIndex) return { own: 0, kindRoute: true }
    return { own: count, kindRoute: false }
}

/**
 * The number of root routes to pop to show the flat screen `count` screens below the flat
 * screen `key`: a root route's key, or the key of a child route of a kind route (a pop
 * past its kind route). A root route with a child stack holds several flat screens, but a
 * pop of the root stack removes the whole route.
 */
export function rootRoutesAbove(state: StackState, key: string, count: number): number {
    const owners = state.routes.flatMap((route, index) =>
        screensOfRoute(route, index).map(() => index)
    )
    const flat = flattenStack(state)
    const ownFlat = flat.findIndex(screen => screen.key === key)
    if (ownFlat < count) return count
    return owners[ownFlat] - owners[ownFlat - count]
}
