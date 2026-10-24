import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useNavigation } from 'expo-router'

const LIST_ROUTE = 'entries/index'

// The entry is usually opened from the list, which is then the previous entry in this stack:
// popping to it keeps one copy of the list. Opened any other way (a deep link, a linked entry),
// there is nothing to pop to, so the list replaces the entry.
export function useBackToEntries() {
    const orgHref = useOrgHref()
    const navigation = useNavigation()
    return () => {
        const state = navigation.getState()
        const previous = state ? state.routes[state.index - 1] : undefined
        if (previous?.name === LIST_ROUTE) {
            router.back()
            return
        }
        router.replace(orgHref('books/entries'))
    }
}
