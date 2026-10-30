import type { ReactNode } from 'react'
import { useDetailSurface } from '../hooks/useDetailSurface'
import { RecordNotFound } from './RecordNotFound'
import { RecordLoadingBody, RecordSurface } from './RecordSurface'

interface RecordByIdScreenProps<R> {
    record: R | undefined
    isLoading: boolean
    testIdPrefix: string
    backLabel: string
    title: string
    notFoundMessage: string
    notFoundBackLabel: string
    onLeave: () => void
    renderRecord: (record: R) => ReactNode
}

/**
 * One record by id, over the list (page) or beside it (panel).
 *
 * The caller reads the record live with `useRecord`, so the form follows edits from
 * elsewhere, and a record deleted elsewhere turns into the not-found message. A delete of
 * this record from its row menu removes the row before the server answers; until the
 * answer the caller passes the row as it was (the same element, so nothing remounts), so
 * a refusal finds the form and its edits, and a success leaves without a not-found.
 */
export function RecordByIdScreen<R>({
    record,
    isLoading,
    testIdPrefix,
    backLabel,
    title,
    notFoundMessage,
    notFoundBackLabel,
    onLeave,
    renderRecord,
}: RecordByIdScreenProps<R>) {
    // Above the early return, so the hook count stays the same when a record loads or
    // is deleted.
    const surface = useDetailSurface()
    if (record !== undefined) return renderRecord(record)
    const body = isLoading ? (
        <RecordLoadingBody testIdPrefix={testIdPrefix} />
    ) : (
        <RecordNotFound
            testIdPrefix={testIdPrefix}
            message={notFoundMessage}
            backLabel={notFoundBackLabel}
            onLeave={onLeave}
        />
    )
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix={testIdPrefix}
            backLabel={backLabel}
            title={title}
            onLeave={onLeave}
            footer={null}
        >
            {body}
        </RecordSurface>
    )
}
