import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useNavigation } from 'expo-router'

const CHART_ROUTE = 'accounts/index'

// The register is opened from the Chart of Accounts, which is then the previous entry in this
// stack: popping to it keeps one copy of that screen. Opened any other way (a deep link, a
// reload), there is nothing to pop to, so the chart replaces the register.
export function useBackToChart() {
    const orgHref = useOrgHref()
    const navigation = useNavigation()
    return () => {
        const state = navigation.getState()
        const previous = state ? state.routes[state.index - 1] : undefined
        if (previous?.name === CHART_ROUTE) {
            router.back()
            return
        }
        router.replace(orgHref('books/accounts'))
    }
}
