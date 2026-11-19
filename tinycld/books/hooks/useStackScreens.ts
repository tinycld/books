import { router, useNavigation, useRoute } from 'expo-router'
import { StackActions, useNavigationState } from 'expo-router/react-navigation'
import { useCallback } from 'react'
import { useKindStack } from '../components/lists/kind-stack-context'
import {
    flattenStack,
    nestedScreens,
    popPlan,
    rootRoutesAbove,
    type StackScreen,
} from '../lib/stack-screens'

// The one reader of the Books stack (lib/stack-screens.ts). A screen of the Books root
// stack reads its own navigator's state as flat screens. A screen of a sales kind's child
// stack reads its child stack's state, after the screen below the kind route that
// DocumentKindLayout passes down (KindStackContext).
//
// The stack comes from useNavigationState, not navigation.getState(): during a render
// getState() still returns the state before the push that mounted this screen. `select`
// returns a primitive, so the selection is stable between renders.
export function useStackPosition<T extends string | number>(
    select: (state: { routes: readonly StackScreen[] }, key: string) => T
): T {
    const { key } = useRoute()
    const kindStack = useKindStack()
    return useNavigationState(state => {
        if (kindStack === null) return select({ routes: flattenStack(state) }, key)
        const below =
            kindStack.belowName === '' ? null : { name: kindStack.belowName, id: kindStack.belowId }
        return select({ routes: nestedScreens(below, kindStack.kindRoute, state) }, key)
    })
}

// Pops `count` flat screens (the count useStackPosition's selectors give). It reads the
// stack when it is called, in an event handler, where getState() is current.
export function usePopScreens(): (count: number) => void {
    const navigation = useNavigation()
    const { key } = useRoute()
    const kindStack = useKindStack()
    const isNested = kindStack !== null
    return count => {
        if (count <= 0) return
        const state = navigation.getState()
        if (state === undefined) return
        const ownIndex = state.routes.findIndex(route => route.key === key)
        const plan = popPlan(ownIndex, count, isNested)
        if (plan.kindRoute) {
            // A pop inside a child stack never removes its first route: the kind route
            // itself leaves the Books root stack, which is this child stack's parent.
            navigation.getParent()?.dispatch(StackActions.pop(1))
            return
        }
        // A root route with a child stack holds several flat screens, but one pop of the
        // root stack removes all of them.
        const own = isNested ? plan.own : rootRoutesAbove(state, key, plan.own)
        if (own > 1) {
            router.dismiss(own)
            return
        }
        if (own === 1) router.back()
    }
}

// Pops this screen when the screen right below it in its stack is the route `name` (a
// screen opened from that route), and gives false when it is not, so the caller replaces
// the screen instead. It reads the stack when it is called, in an event handler. A screen
// outside a stack has no state, so nothing is below it.
export function usePopToScreenBelow(name: string): () => boolean {
    const navigation = useNavigation()
    return () => {
        const state = navigation.getState?.()
        if (state === undefined || state.routes[state.index - 1]?.name !== name) return false
        router.back()
        return true
    }
}

// Shows the route `name` in place of this screen: it pops back to that route when the
// stack already holds it, so the stack never holds two, and else replaces this screen
// with it. A stack action changes only this stack's history. It reads the stack when it
// is called. The function is stable, so it can be a focus effect.
export function useLandOnRoute(name: string): () => void {
    const navigation = useNavigation()
    return useCallback(() => {
        const hasRoute = navigation.getState()?.routes.some(route => route.name === name)
        navigation.dispatch(hasRoute ? StackActions.popTo(name) : StackActions.replace(name))
    }, [navigation, name])
}
