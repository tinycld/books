import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useRoute } from 'expo-router'
import { useNavigationState } from 'expo-router/react-navigation'
import { documentHref, documentStackRouteName } from '../lib/document-routes'
import { ESTIMATE_KIND } from '../lib/sales-document-kinds'

const LIST_ROUTE = 'entries/index'
const REGISTER_ROUTE = 'accounts/[id]'
const ESTIMATE_ROUTE = documentStackRouteName(ESTIMATE_KIND)

const LABELS: Record<string, string> = {
    [REGISTER_ROUTE]: 'Register',
    [ESTIMATE_ROUTE]: 'Estimate',
}

// The screens an entry pops back to when one is right below it.
const POP_ROUTES = new Set([LIST_ROUTE, REGISTER_ROUTE, ESTIMATE_ROUTE])

// An entry is opened from the list or from an account register, and an invoice also from
// the estimate it is made from (Convert to invoice, Open invoice), which is then the
// previous entry in this stack: popping to it keeps one copy of that screen and its
// scroll position. Opened any other way (a deep link, a reload), there is nothing to pop
// to: an invoice made from an estimate (`estimateId`) replaces itself with that estimate,
// any other entry with the list (lesson 15). The label names the screen that back leads
// to. The stack comes from useNavigationState, not navigation.getState(): during a render
// getState() still returns the state before the push that mounted this screen.
export function useBackToEntries(estimateId = '') {
    const orgHref = useOrgHref()
    const { key } = useRoute()
    const previous = useNavigationState(state => {
        const index = state.routes.findIndex(route => route.key === key)
        return index > 0 ? state.routes[index - 1].name : undefined
    })
    const popsBack = previous !== undefined && POP_ROUTES.has(previous)
    const target = popsBack ? previous : estimateId ? ESTIMATE_ROUTE : LIST_ROUTE
    const label = LABELS[target] ?? 'Journal entries'
    const onBack = () => {
        if (popsBack) {
            router.back()
            return
        }
        const href = estimateId ? documentHref(ESTIMATE_KIND, estimateId) : 'books/entries'
        router.replace(orgHref(href))
    }
    return { label, onBack }
}
