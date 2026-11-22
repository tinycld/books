import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { usePopToScreenBelow } from './useStackScreens'

const ENTRIES_ROUTE = 'entries/index'

/**
 * Where a deposit's Back, Cancel and deleted draft go. A deposit has no list of its own
 * (bank deposit spec §2, Q7): Journal Entries is where one is found. Opened from that
 * list, Back pops to it, so one copy of the list stays with its scroll and filters; opened
 * any other way (search, a register, a link) the list replaces the deposit (the
 * useBackToChart pattern).
 */
export function useBackToJournalEntries() {
    const orgHref = useOrgHref()
    const popToEntries = usePopToScreenBelow(ENTRIES_ROUTE)
    return () => {
        if (popToEntries()) return
        router.replace(orgHref('books/entries'))
    }
}
