import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import type { SaveOutcome } from './useEntrySubmit'

// Where a new form (or a new correction) goes after a save. Replacing keeps the unsaved
// form out of the back stack. A post opens the read view, a draft its own form, and Post &
// new a fresh form that keeps the register's account.
export function useTransferAfterSave(from?: string) {
    const orgHref = useOrgHref()
    return (id: string, outcome: SaveOutcome) => {
        if (outcome === 'post-new') {
            router.replace(
                orgHref(
                    from
                        ? `books/transfers/new?from=${encodeURIComponent(from)}`
                        : 'books/transfers/new'
                )
            )
            return
        }
        router.replace(orgHref(`books/transfers/${id}`))
    }
}
