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
    const mode = navigationModeFor(openCustomerFromPath(pathname))

    const go = (route: CustomerRoute) => {
        const href = orgHref(route.path, route.params)
        if (mode === 'replace') router.replace(href)
        else router.push(href)
    }

    return {
        open: (id: string) => go(customerPath(id)),
        openNew: (parentId?: string) => go(newCustomerPath(parentId)),
        // Dismisses to the list even after a deep link with no history to go back through.
        leave: () => router.dismissTo(orgHref(CUSTOMERS_PATH)),
    }
}
