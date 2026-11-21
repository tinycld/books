import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify'
import { pb } from '@tinycld/core/lib/pocketbase'
import { saveFile } from '@tinycld/core/lib/save-file'
import { serverFetch } from '@tinycld/core/lib/server-fetch'
import { authHeaders } from '../lib/auth-headers'
import { isExpectedRefusal, PdfRefusalError, pdfDownloadName, pdfPath } from '../lib/pdf-download'

export interface PdfDownloadInput {
    kind: string
    /** The record printed; omitted for a kind printed from no record (the sample). */
    id?: string
    /**
     * Names the saved file (".pdf" is added) only when the response has no
     * usable Content-Disposition: the server names the file.
     */
    fallbackName: string
}

/**
 * Fetch a printed Books document's bytes with the bearer token, as the route needs it.
 * A refusal throws a PdfRefusalError with the server's message. The body is read as
 * bytes; text would corrupt a PDF.
 */
export async function fetchPdf(kind: string, id?: string) {
    const response = await serverFetch(pb.buildURL(pdfPath(kind, id)), {
        method: 'GET',
        headers: authHeaders(),
    })
    if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        throw new PdfRefusalError(response.status, body)
    }
    return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        disposition: response.headers.get('Content-Disposition'),
        headers: response.headers,
    }
}

/**
 * Download a printed Books document.
 *
 * The route needs the bearer token, so the bytes are fetched here (a browser
 * anchor or the native downloader would make its own unauthenticated request),
 * then handed to core's saveFile: a Blob URL on web, a cache file and the share
 * sheet on native. The body is read as bytes; text would corrupt a PDF.
 */
export function usePdfDownload() {
    return useMutation<void, Error, PdfDownloadInput>({
        mutationKey: ['books', 'pdf'],
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
        mutationFn: async ({ kind, id, fallbackName }: PdfDownloadInput) => {
            const { bytes, disposition } = await fetchPdf(kind, id)
            await saveFile({
                bytes,
                fileName: pdfDownloadName(disposition, fallbackName),
                mimeType: 'application/pdf',
                uti: 'com.adobe.pdf',
            })
        },
        onError: (error: unknown) => {
            if (isExpectedRefusal(error)) {
                log.info('books.pdf', 'download refused', {
                    status: error.status,
                    error: errorToString(error),
                })
            } else {
                log.error('books.pdf', error)
            }
            notify.emit({
                event: 'mutation.error',
                title: 'Could not create the PDF',
                body: errorToString(error),
                durationMs: 6000,
                data: { operation: 'books.pdf', error: errorToString(error) },
            })
        },
    })
}
