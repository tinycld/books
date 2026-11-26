import { CUSTOMERS_PATH } from '../lib/customer-route'
import { documentStackRouteName } from '../lib/document-routes'
import { screensAboveTarget } from '../lib/stack-screens'
import { useRecordNavigation } from './useRecordNavigation'
import { useStoredCodeKey } from './useRouteRecordId'
import { usePopScreens, useStackPositionAtCall } from './useStackScreens'

// The customer page's screen in the Books stack (`customers/[id]`).
const CUSTOMER_SCREEN = documentStackRouteName({ routeBase: CUSTOMERS_PATH })

export function useCustomerNavigation() {
    const nav = useRecordNavigation(CUSTOMERS_PATH, useStoredCodeKey('books_customers'))
    return {
        open: nav.open,
        openNew: (parentId?: string) => nav.openNew(parentId ? { parent: parentId } : undefined),
        leave: nav.leave,
    }
}

/**
 * Opens a customer's page from another screen (an invoice's payments line): it pops back to
 * that page when it is below this screen (the screen was opened from it), so the stack keeps
 * one copy of it; else it opens it as the customer list does (useCustomerNavigation). The
 * stack is read at the call. A screen calls it outside Dialog and Sheet content (the native
 * overlay host does not pass the screen's navigation) and hands the function in.
 */
export function useOpenCustomerPage(): (customerId: string) => void {
    const navigation = useCustomerNavigation()
    const readStack = useStackPositionAtCall()
    const popScreens = usePopScreens()
    return customerId => {
        const screensAbove = readStack((state, key) =>
            screensAboveTarget(state.routes, key, { name: CUSTOMER_SCREEN, id: customerId })
        )
        if (screensAbove > 0) {
            popScreens(screensAbove)
            return
        }
        navigation.open(customerId)
    }
}
