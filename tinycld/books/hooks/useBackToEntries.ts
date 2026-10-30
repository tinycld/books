import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useRoute } from 'expo-router'
import { useNavigationState } from 'expo-router/react-navigation'

const LIST_ROUTE = 'entries/index'
const REGISTER_ROUTE = 'accounts/[id]'

// An entry is opened from the list or from an account register, which is then the previous
// entry in this stack: popping to it keeps one copy of that screen and its scroll position.
// Opened any other way (a deep link, a reload), there is nothing to pop to, so the list
// replaces the entry. The label names the screen that back leads to.
// The stack comes from useNavigationState, not navigation.getState(): during a render
// getState() still returns the state before the push that mounted this screen.
export function useBackToEntries() {
    const orgHref = useOrgHref()
    const { key } = useRoute()
    const previous = useNavigationState(state => {
        const index = state.routes.findIndex(route => route.key === key)
        return index > 0 ? state.routes[index - 1].name : undefined
    })
    const label = previous === REGISTER_ROUTE ? 'Register' : 'Journal entries'
    const onBack = () => {
        if (previous === LIST_ROUTE || previous === REGISTER_ROUTE) {
            router.back()
            return
        }
        router.replace(orgHref('books/entries'))
    }
    return { label, onBack }
}
