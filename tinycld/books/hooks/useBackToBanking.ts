import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import type { ReviewTab } from '../lib/bank-review'

// Banking is the hub the import page was pushed from, so the way back pops to it, with the
// file's account selected when it is known, and the given tab of its panel.
export function useBackToBanking(connectionId: string | undefined, tab?: ReviewTab): () => void {
    const orgHref = useOrgHref()
    const tabParam = tab ? `&tab=${tab}` : ''
    return () =>
        router.dismissTo(
            orgHref(
                connectionId ? `books/banking?account=${connectionId}${tabParam}` : 'books/banking'
            )
        )
}
