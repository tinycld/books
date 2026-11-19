import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useNavigation } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { useKindStack } from '../components/lists/kind-stack-context'
import { targetModeFor } from '../lib/record-route'

/**
 * How the read view of record `recordId` opens `href` (a path under the org). In a kind's
 * child stack, a route of the kind's own stack (`<kind>/new?replaces=`, `?copy=`) replaces
 * the read view, so Back returns to the list; any other route (Pay Bills, a screen of the
 * Books root stack) is pushed over the kind route, which a replace from the child stack
 * would drop with its list (`targetModeFor`). A read view with no child stack replaces
 * itself, so a pushed screen does not stay mounted under the new one.
 */
export function useOpenFromReadView(recordId: string): (href: string) => void {
    const orgHref = useOrgHref()
    const kindStack = useKindStack()
    return href => {
        const mode =
            kindStack === null
                ? 'replace'
                : targetModeFor({ kind: 'id', id: recordId }, `books/${kindStack.kindRoute}`, href)
        if (mode === 'push') router.push(orgHref(href))
        else router.replace(orgHref(href))
    }
}

/**
 * Opens `href`, a screen of the Books root stack (a journal entry), in the read view's
 * place: Back from it goes where Back from the read view went. When the read view has the
 * kind's list below it in its child stack, the read view leaves that stack and `href` is
 * pushed over the kind route, so the list, its scroll position and its filters stay (a
 * replace from the child stack would replace the whole kind route). When the read view is
 * the first screen of its child stack (it was opened from another screen), it replaces the
 * kind route, as it did before the kind routes had a child stack. A screen outside a stack
 * has no state and replaces itself.
 */
export function useOpenInPlaceOfReadView(): (href: string) => void {
    const orgHref = useOrgHref()
    const kindStack = useKindStack()
    const navigation = useNavigation()
    return href => {
        const state = navigation.getState?.()
        const hasListBelow = kindStack !== null && state !== undefined && state.index > 0
        if (hasListBelow) {
            navigation.dispatch(StackActions.pop())
            router.push(orgHref(href))
            return
        }
        router.replace(orgHref(href))
    }
}
