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

    // What a screen with other failed reads merges into its one recovery call.
    const recovery = settingsQuery.isError
        ? { queries: [settingsQuery.collection], sources: [settingsCollection] }
        : { queries: [], sources: [] }

    return {
        settings: settingsQuery.data?.[0],
        isReady: settingsQuery.isReady,
        hasLoadError: settingsQuery.isError,
        retryLoad,
        recovery,
    }
}
