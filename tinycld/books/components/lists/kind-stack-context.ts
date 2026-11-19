import { useRoute } from 'expo-router'
import { useNavigationState } from 'expo-router/react-navigation'
import { createContext, useContext, useMemo } from 'react'
import { screenBelowRoute } from '../../lib/stack-screens'

// Navigation plumbing for the screens of one kind's child stack (SalesKindLayout provides
// it): the kind route's name in the Books root stack and the top screen of the root route
// below it (`belowName` is '' when nothing is below). A screen of the child stack cannot read
// the root stack's state at render, so the layout, a root screen, reads it for them. It is
// not shared UI state.
export type KindStack = { kindRoute: string; belowName: string; belowId: string }

export const KindStackContext = createContext<KindStack | null>(null)

// null on a screen of the Books root stack (outside every kind layout).
export function useKindStack(): KindStack | null {
    return useContext(KindStackContext)
}

/**
 * The value a kind layout (a screen of the Books root stack) provides to its child stack:
 * its route `kindRoute` (`invoices`) and the top screen of the root route below it. Read
 * with useNavigationState, not getState(): during a render getState() still returns the
 * state before the push that mounted this route. Two selectors that return strings keep
 * the selection stable between renders.
 */
export function useKindStackValue(kindRoute: string): KindStack {
    const { key } = useRoute()
    const belowName = useNavigationState(state => screenBelowRoute(state, key)?.name ?? '')
    const belowId = useNavigationState(state => screenBelowRoute(state, key)?.id ?? '')
    return useMemo(() => ({ kindRoute, belowName, belowId }), [kindRoute, belowName, belowId])
}
