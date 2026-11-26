import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { documentPath, documentStackRouteName } from '../lib/document-routes'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import { screensAboveTarget } from '../lib/stack-screens'
import { usePopScreens, useStackPosition, useStackPositionAtCall } from './useStackScreens'

type LinkKind = Pick<SalesDocumentKind, 'routeBase'>

/**
 * Opens a document another one names (its estimate, its invoice). When that document's
 * screen is below this one in the stack (this one was opened from it: Convert to invoice,
 * Open invoice, a source link), it pops back to it, so the stack keeps one copy of that
 * screen; else it pushes the document's route, so Back returns here.
 */
export function useOpenDocument(kind: LinkKind, id: string) {
    const orgHref = useOrgHref()
    const name = documentStackRouteName(kind)
    const screensAbove = useStackPosition((state, key) =>
        screensAboveTarget(state.routes, key, { name, id })
    )
    const popScreens = usePopScreens()
    return () => {
        if (screensAbove > 0) {
            popScreens(screensAbove)
            return
        }
        router.push(orgHref(documentPath(kind, id)))
    }
}

/**
 * useOpenDocument for a document known only when it is opened (a row of a list): the same
 * rule, the stack read at the call. A screen calls it outside Dialog and Sheet content (the
 * native overlay host does not pass the screen's navigation) and hands the function in.
 */
export function useOpenDocumentById(kind: LinkKind): (id: string) => void {
    const orgHref = useOrgHref()
    const name = documentStackRouteName(kind)
    const readStack = useStackPositionAtCall()
    const popScreens = usePopScreens()
    return id => {
        const screensAbove = readStack((state, key) =>
            screensAboveTarget(state.routes, key, { name, id })
        )
        if (screensAbove > 0) {
            popScreens(screensAbove)
            return
        }
        router.push(orgHref(documentPath(kind, id)))
    }
}
