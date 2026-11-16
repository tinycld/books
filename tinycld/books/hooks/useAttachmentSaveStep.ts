import { log } from '@tinycld/core/lib/logger'
import { performMutations } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { writeRefusalText } from '../lib/refusal'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import {
    type AttachmentDraft,
    hasSessionChanges,
    useAttachmentsStore,
} from '../stores/attachments-store'
import { useAttachmentFileUpload } from './useAttachmentUpload'

/**
 * A save's attachments step stored the document but not all of its attachment work:
 * `count` files are not stored (failed, or added while the step ran), and `refusal` is the
 * server's text of the first refused delete, or null. The document stays a draft; the
 * files stay in the session for the next save, and a refused row shows again with its
 * text.
 */
export class AttachmentsNotSaved extends Error {
    count: number
    refusal: string | null

    constructor(count: number, refusal: string | null) {
        super(`${count} attachments were not stored`)
        this.name = 'AttachmentsNotSaved'
        this.count = count
        this.refusal = refusal
    }
}

// A file the step uploads: pending, or failed at an earlier save or Retry. A file whose
// upload is running (a Retry) is left to it.
function isWaiting(draft: AttachmentDraft): boolean {
    return draft.state.kind === 'pending' || draft.state.kind === 'failed'
}

function draftOf(sessionKey: string, key: string): AttachmentDraft | undefined {
    return useAttachmentsStore.getState().sessions[sessionKey]?.drafts.find(d => d.key === key)
}

// Resolves when the draft's running upload (a Retry pressed before the save) has ended:
// the draft left the session (stored) or is no longer uploading.
function uploadEnded(sessionKey: string, key: string): Promise<void> {
    return new Promise(resolve => {
        const isRunning = () => draftOf(sessionKey, key)?.state.kind === 'uploading'
        if (!isRunning()) {
            resolve()
            return
        }
        const stop = useAttachmentsStore.subscribe(() => {
            if (isRunning()) return
            stop()
            resolve()
        })
    })
}

// Whether a form's session holds work for its save: a file not stored yet (an uploading
// one too: a Retry's upload the save waits for) or a stored row to delete. No session (a
// kind without attachments) holds none.
export function hasAttachmentWork(sessionKey: string | undefined): boolean {
    if (!sessionKey) return false
    return hasSessionChanges(useAttachmentsStore.getState().sessions[sessionKey])
}

interface AttachmentStepInput {
    kind: Pick<SalesDocumentKind, 'key'>
    // The written document the files go to.
    recordId: string
    sessionKey: string
}

/**
 * The attachments step of a bill's or an expense's save (spec §3.2), run after the
 * document's rows are written and before the post: uploads the session's files to
 * `recordId` in list order, one request at a time (each row shows its progress), then
 * deletes every stored row the session marked for removal. Each file's state is read
 * from the store right before its turn: a file that is pending or failed uploads, a file
 * whose Retry is running is waited for and not sent again, a file that went is skipped.
 * A stored file leaves the session, and so does a deleted row's mark; a failed upload
 * stays with its error, a refused delete shows its row again with the server's text
 * (refuseRemoval). When any file is still not stored afterwards (failed, or added while
 * the step ran) or a delete was refused, the step throws AttachmentsNotSaved and the save
 * neither posts nor leaves the form, so no file is lost and the next save tries again.
 */
export function useAttachmentSaveStep() {
    const [attachments] = useStore('books_attachments')
    const storeFile = useAttachmentFileUpload()

    // The server's text when the delete was refused; null when the row was deleted.
    const removeStored = async (sessionKey: string, id: string): Promise<string | null> => {
        try {
            await performMutations(function* () {
                yield attachments.delete(id)
            })
        } catch (error) {
            const text = writeRefusalText(error)
            log.warn('books.attachments', 'remove refused', { id, error: text })
            useAttachmentsStore.getState().refuseRemoval(sessionKey, id, text)
            return text
        }
        useAttachmentsStore.getState().unmarkRemoval(sessionKey, id)
        return null
    }

    const storeDraft = async (input: AttachmentStepInput, key: string) => {
        const { kind, recordId, sessionKey } = input
        const draft = draftOf(sessionKey, key)
        if (!draft) return
        // A Retry's upload already sent this file: its answer is the file's, so a refusal
        // stays for the next save and the step sends nothing again.
        if (!isWaiting(draft)) {
            await uploadEnded(sessionKey, key)
            return
        }
        await storeFile({ draft, sessionKey, kind, parentId: recordId })
    }

    return async (input: AttachmentStepInput): Promise<void> => {
        const { sessionKey } = input
        const session = useAttachmentsStore.getState().sessions[sessionKey]
        if (!session) return
        for (const { key } of session.drafts) await storeDraft(input, key)
        let refusal: string | null = null
        for (const id of session.removals) {
            const refused = await removeStored(sessionKey, id)
            refusal = refusal ?? refused
        }
        const notStored = useAttachmentsStore.getState().sessions[sessionKey]?.drafts.length ?? 0
        if (notStored > 0 || refusal !== null) throw new AttachmentsNotSaved(notStored, refusal)
    }
}

export type RunAttachmentStep = ReturnType<typeof useAttachmentSaveStep>
