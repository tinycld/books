import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMyLiveQuery } from '@tinycld/core/lib/use-my-live-query'
import { accessFromRow } from '../lib/access'

// The caller's Books level, from the same books_access view the server rules
// read. Shared because every Books screen gates its writes on it.
export function useBooksAccess() {
    const [accessCollection] = useStore('books_access')
    const { data, isReady } = useMyLiveQuery((query, { userId }) =>
        query.from({ access: accessCollection }).where(({ access }) => eq(access.user, userId))
    )
    return accessFromRow(data?.[0], isReady)
}
