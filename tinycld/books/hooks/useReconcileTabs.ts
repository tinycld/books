import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import type { ReconcileTab } from '../lib/reconcile-history'

const TAB_ROUTES: Record<ReconcileTab, string> = {
    accounts: 'books/reconcile',
    history: 'books/reconcile/history',
}

function isReconcileTab(key: string): key is ReconcileTab {
    return key in TAB_ROUTES
}

/**
 * The tab handler of Reconcile, Accounts · History (reconciliation report spec §2): a press
 * on the other tab replaces the route, so Back leaves Reconcile; a press on the selected tab
 * does nothing.
 */
export function useReconcileTabs(selected: ReconcileTab) {
    const orgHref = useOrgHref()
    const onSelect = (key: string) => {
        if (key === selected || !isReconcileTab(key)) return
        router.replace(orgHref(TAB_ROUTES[key]))
    }
    return { onSelect }
}
