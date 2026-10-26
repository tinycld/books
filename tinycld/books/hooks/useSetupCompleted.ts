import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'

// `undefined` until the settings row has loaded, so a caller never treats a
// slow load as "setup not done".
export function useSetupCompleted(): boolean | undefined {
    const [settingsCollection] = useStore('books_settings')
    const { data, isReady } = useLiveQuery({
        query: query => query.from({ settings: settingsCollection }),
        queryKey: ['books', 'setup-completed'],
    })
    if (!isReady) return undefined
    return !!data?.[0]?.setup_completed
}
