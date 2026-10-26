import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMyLiveQuery } from '@tinycld/core/lib/use-my-live-query'
import { accessFromRow } from '../lib/access'

// The caller's Books level, from the same books_access view the server rules
// read. Shared because every Books screen gates its writes on it.
export function useBooksAccess() {
    const [accessCollection] = useStore('books_access')
    const { data, isReady, isError, collection } = useMyLiveQuery(
        (query, { userId }) =>
            query.from({ access: accessCollection }).where(({ access }) => eq(access.user, userId)),
        { queryKey: ['books', 'access'] }
    )
    // isError and collection let a screen show an error state and retry the
    // read, instead of waiting forever on an isReady that never turns true.
    return { ...accessFromRow(data?.[0], isReady), isError, collection }
}
