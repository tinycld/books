import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'

// `undefined` until the settings row has loaded, so a caller never treats a
// slow load as "setup not done".
export function useSetupCompleted(): boolean | undefined {
    const [settingsCollection] = useStore('books_settings')
    // An explicit key, so the query's identity is not rebuilt from its IR on every render.
    const { data, isReady } = useLiveQuery({
        queryKey: ['books.setup-completed.settings'],
        query: query => query.from({ settings: settingsCollection }),
    })
    if (!isReady) return undefined
    return !!data?.[0]?.setup_completed
}
