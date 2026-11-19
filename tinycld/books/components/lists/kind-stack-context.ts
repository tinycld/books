import { createContext, useContext } from 'react'
import type { BelowScreen } from '../../lib/stack-screens'

// Navigation plumbing for the screens of one kind's child stack (DocumentKindLayout
// provides it): the kind route's name in the Books root stack and every flat screen of the
// root routes below it, lowest first (`below` is empty when nothing is below). A screen of
// the child stack cannot read the root stack's state at render, so the layout, a root
// screen, reads it for them. It is not shared UI state.
export type KindStack = { kindRoute: string; below: readonly BelowScreen[] }

export const KindStackContext = createContext<KindStack | null>(null)

// null on a screen of the Books root stack (outside every kind layout).
export function useKindStack(): KindStack | null {
    return useContext(KindStackContext)
}
