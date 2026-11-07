import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'

// Banking is the hub the import page was pushed from, so the way back pops to it, with the
// file's account selected when it is known.
export function useBackToBanking(connectionId: string | undefined): () => void {
    const orgHref = useOrgHref()
    return () =>
        router.dismissTo(
            orgHref(connectionId ? `books/banking?account=${connectionId}` : 'books/banking')
        )
}
