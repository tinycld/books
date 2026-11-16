import type { PickedFile } from '@tinycld/core/file-viewer/picked-file'
import { throttleProgress, uploadRecordWithFile } from '@tinycld/core/file-viewer/upload-file'
import { usePickFiles } from '@tinycld/core/file-viewer/use-pick-files'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { acceptServerRow } from '@tinycld/core/lib/server-rows'
import { newRecordId } from 'pbtsdb/core'
import { useEffect } from 'react'
import {
    ATTACHMENTS_COLLECTION,
    attachmentCount,
    attachmentIssue,
    attachmentMimeOf,
    attachmentParentColumn,
    isAttachmentRow,
} from '../lib/attachments'
import type { AttachmentUploadState } from '../lib/attachments-fixture'
import { writeRefusalText } from '../lib/refusal'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import { uploadErrorText } from '../lib/upload-errors'
import {
    type AttachmentDraft,
    type AttachmentSession,
    isReadSession,
    readSessionKey,
    useAttachmentsStore,
} from '../stores/attachments-store'
import { PICK_FAILED_TEXT } from './useCsvPicker'

const EMPTY_SESSION: AttachmentSession = { drafts: [], removals: [], refusal: null }
const PENDING: AttachmentUploadState = { kind: 'pending' }
const UPLOAD_STARTED: AttachmentUploadState = { kind: 'uploading', percent: 0 }

interface AttachmentUploadInput {
    kind: Pick<SalesDocumentKind, 'key'>
    // The stored document the files belong to (a form's own, or the draft a new form
    // wrote); undefined on a new form that wrote nothing yet.
    recordId: string | undefined
    sessionKey: string
    // The document's stored attachments (section and custom File field rows).
    count: number
}

interface FileUploadInput {
    draft: AttachmentDraft
    sessionKey: string
    kind: Pick<SalesDocumentKind, 'key'>
    // The stored document the file goes to.
    parentId: string
}

/**
 * The upload of one file not stored yet, with its progress in the attachments store: a
 * read view's at once, a form's Retry, and a form save's attachments step
 * (useAttachmentSaveStep).
 */
export function useAttachmentFileUpload() {
    const [attachments] = useStore('books_attachments')

    // Files the stored row so it shows before the realtime echo. The server has the file
    // whatever happens here, so the echo or the next load lists it; a failure only logs.
    const acceptStoredRow = async (row: unknown, parentId: string) => {
        if (!isAttachmentRow(row)) {
            log.warn('books.attachments', 'upload answered with no row', { parentId })
            return
        }
        try {
            await acceptServerRow(attachments, row, 'books.attachments.upload')
        } catch (error) {
            log.warn('books.attachments', 'stored row not accepted', {
                parentId,
                error: String(error),
            })
        }
    }

    // Stores one file on `parentId`; true when it was stored. A refusal or a transport
    // failure leaves the draft failed with the text its row shows. Once the server has
    // the file the draft goes at once, so the file never shows (or counts) twice, and a
    // failure after that point is not the upload's: Retry would store a second copy.
    return async ({ draft, sessionKey, kind, parentId }: FileUploadInput): Promise<boolean> => {
        const setDraftState = (state: AttachmentUploadState) =>
            useAttachmentsStore.getState().setState(sessionKey, draft.key, state)
        setDraftState(UPLOAD_STARTED)
        const onProgress = throttleProgress((loaded, total) => {
            const percent = total > 0 ? Math.round((loaded / total) * 100) : 0
            setDraftState({ kind: 'uploading', percent })
        })
        let row: unknown
        try {
            row = await uploadRecordWithFile({
                collection: ATTACHMENTS_COLLECTION,
                fields: { [attachmentParentColumn(kind)]: parentId, field: '' },
                file: draft.file,
                fileField: 'file',
                onProgress,
            })
        } catch (error) {
            const { text, isTransport } = uploadErrorText(error)
            if (isTransport) log.warn('books.attachments', 'upload failed', { parentId })
            setDraftState({ kind: 'failed', message: text })
            return false
        }
        useAttachmentsStore.getState().discard(sessionKey, draft.key)
        await acceptStoredRow(row, parentId)
        return true
    }
}

/**
 * Adding files to a bill or an expense (spec §3.1, §3.2): Attach files, a web drop, the
 * client checks, and the upload of each file with its progress. The files that are not
 * stored yet are in the attachments store under `sessionKey`. A read view's session
 * uploads each file at once; a form's files are pending until its save, and Retry of a
 * failed one uploads it at once when the document is stored (`recordId`).
 */
export function useAttachmentUpload({ kind, recordId, sessionKey, count }: AttachmentUploadInput) {
    const { pickFiles } = usePickFiles()
    const storeFile = useAttachmentFileUpload()
    const isRead = isReadSession(sessionKey)

    const uploadNow = (draft: AttachmentDraft, parentId: string) =>
        storeFile({ draft, sessionKey, kind, parentId })

    // Checks each file against the document's count (stored rows, plus the files not
    // stored yet, less the marked removals); a refused file is not added and the first
    // refusal shows until the next add.
    // A cancelled picker gives no files: nothing was added, so the refusal stays.
    const addFiles = (files: PickedFile[]) => {
        if (files.length === 0) return
        const store = useAttachmentsStore.getState()
        const session = store.sessions[sessionKey] ?? EMPTY_SESSION
        let taken = attachmentCount(count, session)
        let refusal: string | null = null
        const drafts: AttachmentDraft[] = []
        for (const file of files) {
            const issue = attachmentIssue(file, kind, taken)
            if (issue !== null) {
                refusal = refusal ?? issue
                continue
            }
            drafts.push({
                key: newRecordId(),
                file,
                name: file.name,
                mimeType: attachmentMimeOf(file.name, file.type),
                size: file.size,
                state: isRead ? UPLOAD_STARTED : PENDING,
            })
            taken += 1
        }
        store.setRefusal(sessionKey, refusal)
        store.add(sessionKey, drafts)
        if (!isRead || !recordId) return
        for (const draft of drafts) void uploadNow(draft, recordId)
    }

    // No type filter goes to the picker: the file is checked after the pick, so a wrong
    // file gets Books' own message. The picker opens inside the press or key event that
    // asked for it, because a browser opens a file input only from a user gesture.
    const pick = () => {
        pickFiles({ multiple: true }).then(addFiles, error => {
            log.error('books.attachments', error, { sessionKey })
            useAttachmentsStore.getState().setRefusal(sessionKey, PICK_FAILED_TEXT)
        })
    }

    const retry = (key: string) => {
        const session = useAttachmentsStore.getState().sessions[sessionKey]
        const draft = session?.drafts.find(d => d.key === key)
        // Only a failed file: a second press while its upload runs would store it twice.
        if (draft?.state.kind !== 'failed' || !recordId) return
        void uploadNow(draft, recordId)
    }

    const discardDraft = (key: string) => useAttachmentsStore.getState().discard(sessionKey, key)

    return { addFiles, pick, retry, discardDraft, uploadNow }
}

export type AttachmentUpload = ReturnType<typeof useAttachmentUpload>

/**
 * The read view's session of files that are not stored yet. The read view screen holds
 * it, not the Attachments section: the PDF view tab unmounts the section, and an upload
 * in progress or a failed file's row (its error, Retry, Remove) must still be there when
 * the Details tab comes back. Dropped when the screen unmounts.
 */
export function useReadAttachmentSession(recordId: string | undefined, isEnabled: boolean) {
    const sessionKey = isEnabled && recordId ? readSessionKey(recordId) : ''
    useEffect(() => {
        if (sessionKey === '') return
        const store = useAttachmentsStore.getState()
        store.open(sessionKey)
        return () => store.drop(sessionKey)
    }, [sessionKey])
}

/**
 * Remove of a stored attachment in a read view (spec §3.3): the delete, and the server's
 * refusal (a void document) on the row it was for.
 */
export function useAttachmentRemove() {
    const [attachments] = useStore('books_attachments')
    const mutation = useMutation({
        mutationFn: function* (id: string) {
            yield attachments.delete(id)
        },
        onError: (error, id) => {
            log.warn('books.attachments', 'remove refused', { id, error: writeRefusalText(error) })
        },
    })
    const refusedId = mutation.isError ? (mutation.variables ?? null) : null
    const refusal = mutation.isError ? writeRefusalText(mutation.error) : ''
    return {
        remove: (id: string) => mutation.mutate(id),
        isPending: mutation.isPending,
        refusedId,
        refusal,
    }
}

export type AttachmentRemove = ReturnType<typeof useAttachmentRemove>
