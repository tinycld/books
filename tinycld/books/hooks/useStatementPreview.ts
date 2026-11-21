import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { saveFile } from '@tinycld/core/lib/save-file'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { pdfDownloadName } from '../lib/pdf-download'
import { errorStatus, messageOnlyRefusal } from '../lib/refusal'
import { postStatementRoute, STATEMENT_PREVIEW_PATH } from '../lib/statement-requests'
import type { CreateStatementsValues } from '../lib/statement-schema'
import { pdfUriOf } from './useDocumentPdf'

const TOAST_MS = 6000

// The cache file of a preview on native (`statements-preview.pdf`); the next view replaces it.
const PREVIEW_FILE = 'statements-preview'

type PreviewFile = { uri: string; bytes: Uint8Array<ArrayBuffer>; fileName: string }

// The preview route's body (statements spec §4.4): the options on screen and the ticked
// customers. An Open items run has no period, so its dates go empty, as Save sends them.
export function previewBodyOf(values: CreateStatementsValues) {
    const hasPeriod = values.type === 'balance_forward'
    return {
        type: values.type,
        statement_date: values.statementDate,
        start_date: hasPeriod ? values.startDate : '',
        end_date: hasPeriod ? values.endDate : '',
        customers: values.recipients
            .filter(recipient => recipient.ticked)
            .map(recipient => recipient.customer),
    }
}

async function fetchPreview(values: CreateStatementsValues): Promise<PreviewFile> {
    const response = await postStatementRoute(STATEMENT_PREVIEW_PATH, previewBodyOf(values))
    const bytes = new Uint8Array(await response.arrayBuffer())
    const fileName = pdfDownloadName(
        response.headers.get('Content-Disposition'),
        `${PREVIEW_FILE}-${values.statementDate}`
    )
    return { uri: await pdfUriOf(PREVIEW_FILE, bytes), bytes, fileName }
}

function showError(title: string, error: unknown) {
    useToastStore.getState().addToast({
        title,
        body: messageOnlyRefusal(error) === null ? errorToString(error) : undefined,
        variant: 'error',
        duration: TOAST_MS,
    })
}

/**
 * Preview of the create screen (statements spec §3.4, §4.4): `open(values)` asks the
 * server for one PDF of the ticked customers' statements and stores nothing. While it is
 * prepared `isPreparing` is true; then `uri` (what PdfCanvasViewer takes) and `fileName`
 * (the server's Content-Disposition) are set until `close()`. A refusal shows an error toast
 * with the server's message and sets `error`; no file is set then. `download()` saves the
 * fetched file under its name with core saveFile, and a failed save shows an error toast.
 */
export function useStatementPreview() {
    const mutation = useMutation({
        mutationKey: ['books', 'statements', 'preview'],
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
        mutationFn: fetchPreview,
        onError: (error: unknown) => {
            const status = errorStatus(error)
            if (status !== undefined && status >= 400 && status < 500) {
                log.info('books.statements.preview', 'preview refused', { status })
            } else {
                log.error('books.statements.preview', error)
            }
            showError(messageOnlyRefusal(error) ?? 'Could not prepare the preview', error)
        },
    })
    const file = mutation.data ?? null
    const uri = file?.uri ?? null

    // A Blob URL holds the bytes until it is revoked: free it when the preview closes or
    // the screen goes.
    useEffect(() => {
        if (uri === null || Platform.OS !== 'web') return
        return () => URL.revokeObjectURL(uri)
    }, [uri])

    const open = (values: CreateStatementsValues) => {
        mutation.reset()
        mutation.mutate(values)
    }
    const close = () => mutation.reset()
    const download = async () => {
        if (file === null) return
        try {
            await saveFile({
                bytes: file.bytes,
                fileName: file.fileName,
                mimeType: 'application/pdf',
                uti: 'com.adobe.pdf',
            })
        } catch (error) {
            log.error('books.statements.preview.download', error)
            showError('Could not save the PDF', error)
        }
    }

    return {
        open,
        close,
        download,
        isPreparing: mutation.isPending,
        uri,
        fileName: file?.fileName ?? null,
        error: mutation.error === null ? null : errorToString(mutation.error),
    }
}
