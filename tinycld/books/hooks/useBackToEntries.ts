import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
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
import { SALES_TABS } from '../lib/sales-lists'
import { isReadOnlyRoute } from '../lib/search-target'
import { usePopScreens, useStackPosition } from './useStackScreens'

const LIST_ROUTE = 'entries/index'
const REGISTER_ROUTE = 'accounts/[id]'
const ESTIMATE_ROUTE = documentStackRouteName(ESTIMATE_KIND)

// The flat screen name of a Sales list (lib/stack-screens.ts): its tab path without
// `books/`, then the list screen of its route (`invoices/index`, `sales/index`). The back
// link names a kind tab by its label and All sales by the area's title, "Sales".
const SALES_LIST_LABELS = Object.fromEntries(
    SALES_TABS.map(tab => [
        `${tab.path.replace(/^books\//, '')}/index`,
        tab.key === 'all' ? 'Sales' : tab.label,
    ])
)

// The screens Back pops to when one is right below this screen, each with the back link's
// text: the journal entry list, a Sales list, a register, and every record route (a
// document, a bill payment, a payment, an entry, a transfer), so Back leads to the screen
// the user came from and the label names it. Any other screen below (or none) is replaced
// with the journal entry list.
const LABELS: Record<string, string> = {
    [LIST_ROUTE]: 'Journal entries',
    ...SALES_LIST_LABELS,
    [REGISTER_ROUTE]: 'Register',
    'entries/[id]': 'Journal entry',
    'transfers/[id]': 'Transfer',
    'payments/[id]': 'Payment',
    'bill-payments/[id]': 'Bill payment',
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

// An entry is opened from a list (journal entries, a Sales list), from an account register
// or from another record (Pay bill on a bill, a payment row of a bill or an invoice, an
// invoice made from an estimate), and Back pops to that screen, which keeps one copy of
// it, its scroll position, its filters and any input typed in it (a draft bill opened by
// search over another draft bill). A read view opened from others of its own route pops
// past them. Opened any other way (a deep link, a reload), there is nothing to pop to: an
// invoice made from an estimate (`estimateId`) replaces itself with that estimate, any
// other entry with the journal entry list (lesson 15). The stack is read as flat screens
// (hooks/useStackScreens.ts), so a document of a kind's child stack sees the list below it.
export function useBackToEntries(estimateId = '') {
    const orgHref = useOrgHref()
    const route = useStackPosition((state, key) => backTarget(state, key, estimateId).route)
    const depth = useStackPosition((state, key) => backTarget(state, key, estimateId).depth)
    const popScreens = usePopScreens()
    const label = LABELS[route]
    const onBack = () => {
        if (depth > 0) {
            popScreens(depth)
            return
        }
        const href = estimateId ? documentHref(ESTIMATE_KIND, estimateId) : 'books/entries'
        router.replace(orgHref(href))
    }
    return { label, onBack }
}
