import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { availableOnly, LIST_ENTRIES, type ListEntry } from '../lib/shell-nav'
import { useShowSetupCard } from './useShowSetupCard'

export function useListsHub(entries: readonly ListEntry[] = LIST_ENTRIES) {
    const orgHref = useOrgHref()
    const showSetupCard = useShowSetupCard()
    const cards = availableOnly(entries)

    return {
        cards,
        isEmpty: cards.length === 0,
        showSetupCard,
        open: (entry: ListEntry) => router.push(orgHref(entry.href)),
    }
}
