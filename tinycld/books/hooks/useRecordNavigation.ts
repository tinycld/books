import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { urlFromState, useUrl } from '@tinycld/core/lib/use-url'
import { router, useNavigation, useNavigationContainerRef } from 'expo-router'
import {
    navigationModeFor,
    newRecordPath,
    openRecordFromPath,
    type RecordRoute,
    recordPath,
} from '../lib/record-route'

export function useRecordNavigation(listPath: string) {
    const orgHref = useOrgHref()
    const { pathname } = useUrl()
    const current = openRecordFromPath(listPath, pathname)
    const mode = navigationModeFor(current)

    const go = (route: RecordRoute) => {
        const href = orgHref(route.path, route.params)
        if (mode === 'replace') router.replace(href)
        else router.push(href)
    }

    return {
        // Pressing the open record's row again (drawn as selected on the panel) keeps the form,
        // its scroll and its unsaved edits, instead of replacing the route with itself.
        open: (id: string) => {
            if (current.kind === 'id' && current.id === id) return
            go(recordPath(listPath, id))
        },
        openNew: (params?: Record<string, string>) => go(newRecordPath(listPath, params)),
        // Dismisses to the list even after a deep link with no history to go back through.
        leave: () => router.dismissTo(orgHref(listPath)),
    }
}

/**
 * Asks, when called, whether the user still sees record `id`: the screen that calls
 * this hook is focused and the URL names that record. Read at the call, not from the
 * last render, because an answer that arrives later (a delete's) must not act on a
 * screen the user has left meanwhile.
 */
export function useIsShowingRecord(listPath: string) {
    const navigation = useNavigation()
    const container = useNavigationContainerRef()
    return (id: string) => {
        if (!container.isReady() || !navigation.isFocused()) return false
        const open = openRecordFromPath(listPath, urlFromState(container.getRootState()).pathname)
        return open.kind === 'id' && open.id === id
    }
}

// The record the URL opens under `listPath`; `openId` is its id, or '' when none or new.
export function useOpenRecord(listPath: string) {
    const open = openRecordFromPath(listPath, useUrl().pathname)
    return { open, openId: open.kind === 'id' ? open.id : '' }
}
