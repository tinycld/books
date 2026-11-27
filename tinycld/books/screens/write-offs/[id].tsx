import { useLocalSearchParams } from 'expo-router'
import { LoadErrorPage } from '../../components/documents/DocumentLoadError'
import { WriteOffScreen } from '../../components/write-offs/WriteOffScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'
import { WRITE_OFF_TEXTS } from '../../lib/write-off-fixture'

// A write-off is posted when it is made, so its route only shows it. A failed read of its
// number shows the screen's load error with Retry.
export default function WriteOffRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_write_offs', key)
    if (route.isError) {
        return (
            <LoadErrorPage
                message={WRITE_OFF_TEXTS.loadError}
                onRetry={route.retry}
                testID="write-off-error"
                retryTestID="write-off-retry"
            />
        )
    }
    if (route.id === undefined) return null
    return <WriteOffScreen key={route.id} id={route.id} />
}
