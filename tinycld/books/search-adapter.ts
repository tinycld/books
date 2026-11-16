import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { SearchRow } from '@tinycld/core/lib/search/types'
import { useUrl } from '@tinycld/core/lib/use-url'
import { useRouter } from 'expo-router'
import { opensOverSameReadView, searchTarget } from './lib/search-target'

// Row shaping is the server's job (server/search.go). Selection stays here
// because it needs the router. The palette calls this hook for every package
// while it is open, so it only takes handles. A hit of the read view on top
// replaces it (opensOverSameReadView); any other hit navigates.
export function useSearchActions() {
    const router = useRouter()
    const orgHref = useOrgHref()
    const { pathname } = useUrl()

    return {
        onSelect: (row: SearchRow) => {
            const target = searchTarget(row.id)
            if (!target) return
            const href = orgHref(target.path, { id: target.id })
            if (opensOverSameReadView(target, pathname)) router.replace(href)
            else router.navigate(href)
        },
    }
}
