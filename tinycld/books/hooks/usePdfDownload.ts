import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify'
import { pb } from '@tinycld/core/lib/pocketbase'
import { serverFetch } from '@tinycld/core/lib/server-fetch'
import type { Directory as CacheDirectory } from 'expo-file-system'
import { Platform } from 'react-native'
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
 * Download a printed Books document.
 *
 * The route needs the bearer token, so the bytes are fetched here (a browser
 * anchor or the native downloader would make its own unauthenticated request),
 * then handed to the platform: a Blob URL on web, a cache file and the share
 * sheet on native (pattern: boards useBoardExport). The body is read as bytes;
 * text would corrupt a PDF.
 */
export function usePdfDownload() {
    return useMutation<void, Error, PdfDownloadInput>({
        mutationKey: ['books', 'pdf'],
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
        mutationFn: async ({ kind, id, fallbackName }: PdfDownloadInput) => {
            const headers: Record<string, string> = {}
            if (pb.authStore.token) {
                headers.Authorization = `Bearer ${pb.authStore.token}`
            }
            const response = await serverFetch(pb.buildURL(pdfPath(kind, id)), {
                method: 'GET',
                headers,
            })
            if (!response.ok) {
                const body: unknown = await response.json().catch(() => null)
                throw new PdfRefusalError(response.status, body)
            }
            const bytes = new Uint8Array(await response.arrayBuffer())
            const disposition = response.headers.get('Content-Disposition')
            await savePdf(bytes, pdfDownloadName(disposition, fallbackName))
        },
        onError: (error: unknown) => {
            if (isExpectedRefusal(error)) {
                log.warn('books.pdf', 'download refused', {
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

const DOWNLOAD_DIR_PREFIX = 'books-pdf-'

// The share sheet can still be reading a file when it resolves, so a download is
// deleted by the next one, not by itself: at most one directory remains.
function removeEarlierDownloads(DirectoryClass: typeof CacheDirectory, cache: CacheDirectory) {
    for (const entry of cache.list()) {
        if (!(entry instanceof DirectoryClass) || !entry.name.startsWith(DOWNLOAD_DIR_PREFIX))
            continue
        try {
            entry.delete()
        } catch (error) {
            log.warn('books.pdf', 'could not delete an earlier download', {
                error: errorToString(error),
            })
        }
    }
}

async function savePdf(bytes: Uint8Array<ArrayBuffer>, fileName: string) {
    if (Platform.OS === 'web') {
        const href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        const anchor = document.createElement('a')
        anchor.href = href
        anchor.download = fileName
        anchor.click()
        // Revoked on the next tick: Safari has not read the blob when click() returns.
        setTimeout(() => URL.revokeObjectURL(href), 0)
        return
    }
    // Lazily imported, as boards useBoardExport and core file-url.ts do: a module-init
    // failure must not break every screen that merely shows the button.
    const [{ Directory, File, Paths }, Sharing] = await Promise.all([
        import('expo-file-system'),
        import('expo-sharing'),
    ])
    if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device')
    }
    removeEarlierDownloads(Directory, Paths.cache)
    // A unique directory so repeated downloads do not collide while the shared name stays readable.
    const dir = new Directory(Paths.cache, `${DOWNLOAD_DIR_PREFIX}${Date.now()}`)
    dir.create({ intermediates: true, idempotent: true })
    const target = new File(dir, fileName)
    target.create()
    await target.write(bytes)
    await Sharing.shareAsync(target.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: fileName,
    })
}
