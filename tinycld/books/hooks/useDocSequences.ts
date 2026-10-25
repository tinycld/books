import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'

export function useDocSequences() {
    const [sequencesCollection] = useStore('books_doc_sequences')
    const sequencesQuery = useLiveQuery({
        query: query =>
            query
                .from({ sequence: sequencesCollection })
                .orderBy(({ sequence }) => sequence.doc_type, 'asc'),
        queryKey: ['books', 'doc-sequences'],
    })

    const retryLoad = () => {
        void recoverLiveQueries({
            queries: [sequencesQuery.collection],
            sources: [sequencesCollection],
            onError: error => log.error('books.sequences', error),
        })
    }

    return {
        sequences: sequencesQuery.data,
        isReady: sequencesQuery.isReady,
        hasLoadError: sequencesQuery.isError,
        retryLoad,
    }
}
