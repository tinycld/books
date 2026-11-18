import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { usePopToScreenBelow } from './useStackScreens'

const CHART_ROUTE = 'accounts/index'

// The register is opened from the Chart of Accounts, which is then the previous entry in this
// stack: popping to it keeps one copy of that screen. Opened any other way (a deep link, a
// reload), there is nothing to pop to, so the chart replaces the register.
export function useBackToChart() {
    const orgHref = useOrgHref()
    const popToChart = usePopToScreenBelow(CHART_ROUTE)
    return () => {
        if (popToChart()) return
        router.replace(orgHref('books/accounts'))
    }
}
