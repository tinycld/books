import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { SearchRow } from '@tinycld/core/lib/search/types'
import { useRouter } from 'expo-router'
import { searchTarget } from './lib/search-target'

// Row shaping is the server's job (server/search.go). Selection stays here
// because it needs the router. The palette calls this hook for every package
// while it is open, so it only takes handles.
export function useSearchActions() {
    const router = useRouter()
    const orgHref = useOrgHref()

    return {
        onSelect: (row: SearchRow) => {
            const target = searchTarget(row.id)
            if (!target) return
            router.navigate(orgHref(target.path, { id: target.id }))
        },
    }
}
