import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useNavigation } from 'expo-router'

const LIST_ROUTE = 'entries/index'
const REGISTER_ROUTE = 'accounts/[id]'

// An entry is opened from the list or from an account register, which is then the previous
// entry in this stack: popping to it keeps one copy of that screen and its scroll position.
// Opened any other way (a deep link, a reload), there is nothing to pop to, so the list
// replaces the entry. The label names the screen that back leads to.
export function useBackToEntries() {
    const orgHref = useOrgHref()
    const navigation = useNavigation()
    const state = navigation.getState()
    const previous = state ? state.routes[state.index - 1]?.name : undefined
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
