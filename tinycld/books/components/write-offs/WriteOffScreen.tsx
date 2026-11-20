import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useWriteOffRecord } from '../../hooks/useWriteOffRecord'
import { type LiveRecovery, mergeRecoveries } from '../../lib/live-recovery'
import { writeOffScreenState } from '../../lib/write-off-actions'
import { WRITE_OFF_TEXTS } from '../../lib/write-off-fixture'
import { LoadErrorPage } from '../documents/DocumentLoadError'
import { LoadingPage } from '../documents/DocumentLoading'
import { DocumentNotice } from '../documents/DocumentNotice'
import { WriteOffReadView } from './WriteOffReadView'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The write-off page at `books/write-offs/<id>` (write-off spec §3.5): exactly one of
 * loading, a failed read with Retry, not found, or the read view. It waits for the
 * write-off and for the caller's Books level (which decides Void); a failed read of either
 * shows the error, and Retry recovers both in one call.
 */
export function WriteOffScreen({ id }: { id: string }) {
    const [accessCollection] = useStore('books_access')
    const access = useBooksAccess()
    const read = useWriteOffRecord(id)
    const isAccessError = access.isError && !access.isReady
    const hasRecord = read.record !== null && access.isReady
    const state = writeOffScreenState({
        isLoading: read.isLoading || !access.isReady,
        isError: read.isError || isAccessError,
        hasRecord,
    })
    const accessRecovery: LiveRecovery = isAccessError
        ? { queries: [access.collection], sources: [accessCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([read.recovery, accessRecovery]),
            onError: err => log.error('books.writeOff', err, { operation: 'retry' }),
        })
    }
    if (state === 'loading') return <LoadingPage testID="write-off-loading-page" />
    if (state === 'error') {
        return (
            <LoadErrorPage
                message={WRITE_OFF_TEXTS.loadError}
                onRetry={retry}
                testID="write-off-error"
                retryTestID="write-off-retry"
            />
        )
    }
    if (state === 'not-found' || !read.record) {
        return <DocumentNotice testID="write-off-not-found" message={WRITE_OFF_TEXTS.notFound} />
    }
    return <WriteOffReadView writeOff={read.record} canWrite={access.canWrite} />
}
