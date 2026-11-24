import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

export function useBooksSettings() {
    const [settingsCollection] = useStore('books_settings')
    const settingsQuery = useLiveQuery({
        query: query => query.from({ settings: settingsCollection }),
        queryKey: ['books', 'settings'],
    })

    const retryLoad = () => {
        void recoverLiveQueries({
            queries: [settingsQuery.collection],
            sources: [settingsCollection],
            onError: error => log.error('books.settings', error),
        })
    }

    const settings = settingsQuery.data?.[0]
    // What a screen with other failed reads merges into its one recovery call. A ready read
    // with no row is reloaded too: the settings screens show it as an error with Retry.
    const needsReload = settingsQuery.isError || (settingsQuery.isReady && !settings)
    const recovery = needsReload
        ? { queries: [settingsQuery.collection], sources: [settingsCollection] }
        : { queries: [], sources: [] }

    return {
        settings,
        isReady: settingsQuery.isReady,
        hasLoadError: settingsQuery.isError,
        retryLoad,
        recovery,
    }
}
