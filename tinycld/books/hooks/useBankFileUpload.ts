import { type PickedFile, uploadFileToPickedFile } from '@tinycld/core/file-viewer/picked-file'
import { uploadRecordWithFile } from '@tinycld/core/file-viewer/upload-file'
import { usePickFiles } from '@tinycld/core/file-viewer/use-pick-files'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { acceptServerRow } from '@tinycld/core/lib/server-rows'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { newRecordId } from 'pbtsdb/core'
import {
    bankFileIssue,
    droppedFilesIssue,
    isBankFileRow,
    uploadErrorText,
} from '../lib/bank-connections'
import { type UploadState, useBankingUIStore } from '../stores/banking-ui-store'
import { PICK_FAILED_TEXT } from './useCsvPicker'

const IDLE: UploadState = { kind: 'idle' }

// One connection's upload: Choose file, the web drop, the client checks and the upload.
// The state is in the banking store under `connectionId`, so the result lands on the
// connection the upload was started for, even if the user selected another card meanwhile.
export function useBankFileUpload(connectionId: string) {
    const { pickFiles } = usePickFiles()
    const [files] = useStore('books_bank_files')
    const writes = useServerActionState()
    const state = useBankingUIStore(s => s.uploads[connectionId]) ?? IDLE
    const setUpload = useBankingUIStore(s => s.setUpload)
    const isBusy = state.kind === 'uploading'
    const isWriteBlocked = writes.isDisabled
    const isUnavailable = isBusy || isWriteBlocked || connectionId === ''

    const upload = async (picked: PickedFile) => {
        const issue = bankFileIssue(picked)
        if (issue) {
            setUpload(connectionId, { kind: 'error', message: issue })
            return
        }
        setUpload(connectionId, { kind: 'uploading', name: picked.name })
        try {
            const row = await uploadRecordWithFile({
                collection: 'books_bank_files',
                fields: { id: newRecordId(), connection: connectionId },
                file: picked,
                fileField: 'file',
            })
            // Accepted so the row shows before the realtime echo.
            if (isBankFileRow(row)) {
                await acceptServerRow(files, row, 'books.banking.upload')
            } else {
                // The server stored the file, so the echo or the next load lists it.
                log.warn('books.banking', 'upload answered with no row', { connectionId })
            }
            setUpload(connectionId, { kind: 'done', name: picked.name })
        } catch (error) {
            const { text, isTransport } = uploadErrorText(error)
            if (isTransport) log.warn('books.banking', 'upload failed', { connectionId })
            setUpload(connectionId, { kind: 'error', message: text })
        }
    }

    // No type filter goes to the picker: the file is checked after the pick, so a wrong
    // file gets Books' own message. The picker is opened inside the press or key event
    // that asked for it, because a browser opens a file input only from a user gesture.
    const pick = () => {
        if (isUnavailable) return
        pickFiles({ sources: ['documents'], multiple: false }).then(
            picked => {
                const [first] = picked
                if (first) void upload(first)
            },
            error => {
                log.error('books.banking', error, { connectionId })
                setUpload(connectionId, { kind: 'error', message: PICK_FAILED_TEXT })
            }
        )
    }

    // A drop while busy or while the server takes no writes is ignored.
    const drop = (dropped: File[]) => {
        if (isUnavailable) return
        const issue = droppedFilesIssue(dropped.length)
        if (issue) {
            setUpload(connectionId, { kind: 'error', message: issue })
            return
        }
        const [first] = dropped
        if (first) void upload(uploadFileToPickedFile(first))
    }

    return { state, pick, drop, isBusy, isWriteBlocked }
}

export type BankFileUpload = ReturnType<typeof useBankFileUpload>
