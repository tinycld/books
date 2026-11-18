import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useRoute } from 'expo-router'
import { useNavigationState } from 'expo-router/react-navigation'
import { documentHref, documentStackRouteName } from '../lib/document-routes'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    EXPENSE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
    VENDOR_CREDIT_KIND,
} from '../lib/sales-document-kinds'
import { isReadOnlyRoute } from '../lib/search-target'

const LIST_ROUTE = 'entries/index'
const REGISTER_ROUTE = 'accounts/[id]'
const ESTIMATE_ROUTE = documentStackRouteName(ESTIMATE_KIND)

// The screens Back pops to when one is right below this screen, each with the back link's
// text: the list, a register, and every record route (a document, a bill payment, a
// payment, a vendor refund, an entry, a transfer), so Back leads to the record the user
// came from and the label names it. A new vendor refund is one too: its "New vendor
// credit" pushes the credit form over it, and that form's Back, Cancel and post return to
// the refund with what was typed in it. Any other screen below (or none) is replaced with
// the list.
const LABELS: Record<string, string> = {
    [LIST_ROUTE]: 'Journal entries',
    [REGISTER_ROUTE]: 'Register',
    'entries/[id]': 'Journal entry',
    'transfers/[id]': 'Transfer',
    'payments/[id]': 'Payment',
    'bill-payments/[id]': 'Bill payment',
    'vendor-refunds/[id]': 'Vendor refund',
    'vendor-refunds/new': 'Vendor refund',
    ...Object.fromEntries(
        [
            INVOICE_KIND,
            SALES_RECEIPT_KIND,
            CREDIT_MEMO_KIND,
            ESTIMATE_KIND,
            BILL_KIND,
            EXPENSE_KIND,
            VENDOR_CREDIT_KIND,
        ].map(kind => [documentStackRouteName(kind), kind.noun])
    ),
}

type StackRoutes = { routes: readonly { key: string; name: string }[] }

/**
 * How far below this screen the screen that Back may pop to is: the next one, or, on a
 * read-only route (a bill payment opened from another one's read view, by search or
 * "Replaced by"), past the screens of this same route right below it, to the first other
 * one: a read view holds no input to lose. A form route goes back one screen, so a draft
 * below a draft of the same route keeps what the user typed in it. 0 when this is the
 * stack's root.
 */
export function popDepth(state: StackRoutes, key: string): number {
    const index = state.routes.findIndex(route => route.key === key)
    if (index <= 0) return 0
    const name = state.routes[index].name
    if (!isReadOnlyRoute(name)) return 1
    let below = index - 1
    while (below > 0 && state.routes[below].name === name) below--
    return index - below
}

/**
 * Where Back leads from this screen: `route` is the route name, `label` the back link's
 * text and `depth` how many screens Back pops (0: nothing to pop to, so Back replaces this
 * screen with `route`). The screen popDepth reaches is popped to when it is the list, a
 * register or a record route (LABELS); otherwise an invoice made from an estimate
 * (`estimateId`) goes to that estimate and any other screen to the list.
 */
export function backTarget(
    state: StackRoutes,
    key: string,
    estimateId = ''
): { route: string; label: string; depth: number } {
    const index = state.routes.findIndex(route => route.key === key)
    const depth = popDepth(state, key)
    const below = depth > 0 ? state.routes[index - depth].name : undefined
    if (below !== undefined && below in LABELS) {
        return { route: below, label: LABELS[below], depth }
    }
    const route = estimateId ? ESTIMATE_ROUTE : LIST_ROUTE
    return { route, label: LABELS[route], depth: 0 }
}

// An entry is opened from the list, from an account register or from another record (Pay
// bill on a bill, a payment row of a bill or an invoice, an invoice made from an estimate),
// and Back pops to that screen, which keeps one copy of it, its scroll position and any
// input typed in it (a draft bill opened by search over another draft bill). A read view
// opened from others of its own route pops past them. Opened any other way (a deep link, a
// reload), there is nothing to pop to: an invoice made from an estimate (`estimateId`)
// replaces itself with that estimate, any other entry with the list (lesson 15).
// The stack comes from useNavigationState, not navigation.getState(): during a render
// getState() still returns the state before the push that mounted this screen. Each
// selector returns a primitive, so the selection is stable between renders.
export function useBackToEntries(estimateId = '') {
    const orgHref = useOrgHref()
    const { key } = useRoute()
    const route = useNavigationState(state => backTarget(state, key, estimateId).route)
    const depth = useNavigationState(state => backTarget(state, key, estimateId).depth)
    const label = LABELS[route]
    const onBack = () => {
        if (depth > 1) {
            router.dismiss(depth)
            return
        }
        if (depth === 1) {
            router.back()
            return
        }
        const href = estimateId ? documentHref(ESTIMATE_KIND, estimateId) : 'books/entries'
        router.replace(orgHref(href))
    }
    return { label, onBack }
}
