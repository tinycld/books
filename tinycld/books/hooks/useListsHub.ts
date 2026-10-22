import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { availableOnly, LIST_ENTRIES, type ListEntry } from '../lib/shell-nav'

export function useListsHub(entries: readonly ListEntry[] = LIST_ENTRIES) {
    const orgHref = useOrgHref()
    const cards = availableOnly(entries)

    return {
        cards,
        isEmpty: cards.length === 0,
        open: (entry: ListEntry) => router.push(orgHref(entry.href)),
    }
}
