import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { urlFromState, useUrl } from '@tinycld/core/lib/use-url'
import { router, useNavigation, useNavigationContainerRef } from 'expo-router'
import {
    CUSTOMERS_PATH,
    type CustomerRoute,
    customerPath,
    navigationModeFor,
    newCustomerPath,
    openCustomerFromPath,
} from '../lib/customer-route'

export function useCustomerNavigation() {
    const orgHref = useOrgHref()
    const { pathname } = useUrl()
    const current = openCustomerFromPath(pathname)
    const mode = navigationModeFor(current)

    const go = (route: CustomerRoute) => {
        const href = orgHref(route.path, route.params)
        if (mode === 'replace') router.replace(href)
        else router.push(href)
    }

    return {
        // Pressing the open customer's row again (drawn as selected on the panel) keeps the form,
        // its scroll and its unsaved edits, instead of replacing the route with itself.
        open: (id: string) => {
            if (current.kind === 'id' && current.id === id) return
            go(customerPath(id))
        },
        openNew: (parentId?: string) => go(newCustomerPath(parentId)),
        // Dismisses to the list even after a deep link with no history to go back through.
        leave: () => router.dismissTo(orgHref(CUSTOMERS_PATH)),
    }
}

/**
 * Asks, when called, whether the user still sees customer `id`: the screen that calls
 * this hook is focused and the URL names that customer. Read at the call, not from the
 * last render, because an answer that arrives later (a delete's) must not act on a
 * screen the user has left meanwhile.
 */
export function useIsShowingCustomer() {
    const navigation = useNavigation()
    const container = useNavigationContainerRef()
    return (id: string) => {
        if (!container.isReady() || !navigation.isFocused()) return false
        const open = openCustomerFromPath(urlFromState(container.getRootState()).pathname)
        return open.kind === 'id' && open.id === id
    }
}
