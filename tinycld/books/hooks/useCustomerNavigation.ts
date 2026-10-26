import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useUrl } from '@tinycld/core/lib/use-url'
import { router } from 'expo-router'
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
