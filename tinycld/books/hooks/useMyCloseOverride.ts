import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMyLiveQuery } from '@tinycld/core/lib/use-my-live-query'
import { parseExpiry, splitOverrides } from '../lib/overrides'
import { useClockTick } from './useClockTick'

// The caller's active override that expires last, if any.
export function useMyCloseOverride() {
    const [overridesCollection] = useStore('books_close_overrides')
    const { data, isReady } = useMyLiveQuery(
        (query, { userId }) =>
            query
                .from({ override: overridesCollection })
                .where(({ override }) => eq(override.user, userId))
                .orderBy(({ override }) => override.expires_at, 'desc'),
        { queryKey: ['books', 'my-close-override'] }
    )
    const now = useClockTick((data ?? []).map(row => parseExpiry(row.expires_at)))
    const latest = splitOverrides(data ?? [], new Date(now)).active[0]
    return {
        override: latest ? { expires_at: latest.expires_at, reason: latest.reason } : undefined,
        isReady,
    }
}
