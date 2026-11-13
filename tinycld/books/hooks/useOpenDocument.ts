import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useRoute } from 'expo-router'
import { useNavigationState } from 'expo-router/react-navigation'
import { documentHref, documentStackRouteName } from '../lib/document-routes'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'

type LinkKind = Pick<SalesDocumentKind, 'routeBase'>

// How many screens to pop to reach the document when its screen is already below this
// one in the stack (this one was opened from it: Convert to invoice, Open invoice, a
// source link); 0 when it is not there.
function useScreensAbove(kind: LinkKind, id: string): number {
    const { key } = useRoute()
    const name = documentStackRouteName(kind)
    return useNavigationState(state => {
        const index = state.routes.findIndex(route => route.key === key)
        if (index <= 0) return 0
        const found = state.routes.slice(0, index).findLastIndex(route => {
            const params = route.params as { id?: string } | undefined
            return route.name === name && params?.id === id
        })
        return found < 0 ? 0 : index - found
    })
}

/**
 * Opens a document another one names (its estimate, its invoice). When that document's
 * screen is below this one in the stack, it pops back to it, so the stack keeps one copy
 * of that screen; else it pushes the document's route, so Back returns here.
 */
export function useOpenDocument(kind: LinkKind, id: string) {
    const orgHref = useOrgHref()
    const screensAbove = useScreensAbove(kind, id)
    return () => {
        if (screensAbove > 0) {
            router.dismiss(screensAbove)
            return
        }
        router.push(orgHref(documentHref(kind, id)))
    }
}
