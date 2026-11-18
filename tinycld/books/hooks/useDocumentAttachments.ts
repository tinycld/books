import { eq, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { attachmentParentColumn, splitAttachmentRows } from '../lib/attachments'
import type { LiveRecovery } from '../lib/live-recovery'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

interface DocumentAttachmentsInput {
    kind: Pick<SalesDocumentKind, 'key' | 'testId'>
    // The stored document; undefined on a new form.
    recordId: string | undefined
    // The document a correction replaces; its rows are the correction's "From" group.
    replaces: string | undefined
}

/**
 * The attachment rows of a bill, an expense or a vendor credit, oldest first, with the
 * uploader's name: one live query over the document and the one it replaces, filtered by
 * the kind's parent column (`attachmentParentColumn`) and split by
 * `splitAttachmentRows`. A new form that corrects nothing reads nothing. A failed read
 * hands its `recovery` to the screen's one Retry; it is not the screen's error, so the
 * document still shows.
 */
export function useDocumentAttachments({ kind, recordId, replaces }: DocumentAttachmentsInput) {
    const [attachmentsCollection, usersCollection] = useStore('books_attachments', 'users')
    const parentColumn = attachmentParentColumn(kind)
    const isEnabled = Boolean(recordId || replaces)
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return undefined
            return q
                .from({ a: attachmentsCollection })
                .where(({ a }) => {
                    if (recordId && replaces) {
                        return or(eq(a[parentColumn], recordId), eq(a[parentColumn], replaces))
                    }
                    return eq(a[parentColumn], recordId || replaces || '')
                })
                .orderBy(({ a }) => a.created)
                .select(({ a }) => ({
                    ...a,
                    uploader: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, a.uploaded_by))
                            .select(({ u }) => ({ name: u.name }))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books', 'attachments', kind.testId, recordId, replaces],
    })
    // materialize() gives the related row (or undefined), never a scalar, so the query
    // narrows the uploader to its name and the name is lifted to `uploaderName` here.
    const all = (isEnabled ? (query.data ?? []) : []).map(({ uploader, ...row }) => ({
        ...row,
        uploaderName: uploader?.name,
    }))
    const split = splitAttachmentRows(all, recordId, replaces)
    const isError = isEnabled && query.isError
    const recovery: LiveRecovery =
        isError && query.collection
            ? { queries: [query.collection], sources: [attachmentsCollection, usersCollection] }
            : NO_RECOVERY
    return {
        ...split,
        isLoading: isEnabled && !query.isReady && !isError,
        isError,
        recovery,
    }
}

export type DocumentAttachments = ReturnType<typeof useDocumentAttachments>
export type DocumentAttachmentRow = DocumentAttachments['rows'][number]
