import { useQuery } from '@tanstack/react-query'
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { isExpectedRefusal } from '../lib/pdf-download'
import { fetchPdf } from './usePdfDownload'

// The route's kind of a printed document (`invoice`, `statement`).
export type PdfKind = { key: string }

const VIEW_DIR_PREFIX = 'books-pdf-view-'

// Native: the bytes go to a cache file the viewer reads. The file of the last view is
// deleted by the next one, so at most one directory remains. Lazily imported, as
// usePdfDownload does: a module-init failure must not break the screen. The file is
// named by `name` (`invoice` gives `invoice.pdf`).
async function cacheFile(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const { Directory, File, Paths } = await import('expo-file-system')
    for (const entry of Paths.cache.list()) {
        if (!(entry instanceof Directory) || !entry.name.startsWith(VIEW_DIR_PREFIX)) continue
        try {
            entry.delete()
        } catch (error) {
            log.warn('books.pdf', 'could not delete an earlier view', {
                error: errorToString(error),
            })
        }
    }
    const dir = new Directory(Paths.cache, `${VIEW_DIR_PREFIX}${Date.now()}`)
    dir.create({ intermediates: true, idempotent: true })
    const target = new File(dir, `${name}.pdf`)
    target.create()
    await target.write(bytes)
    return target.uri
}

/**
 * What core PdfCanvasViewer takes for a PDF's bytes: a Blob URL on web (the caller revokes
 * it when it is done), the cache file `<name>.pdf` on native.
 */
export async function pdfUriOf(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    if (Platform.OS === 'web') {
        return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    }
    return await cacheFile(name, bytes)
}

/**
 * The PDF of a saved document, fetched with the bearer token as usePdfDownload does, as the
 * viewer's uri (pdfUriOf) with the response's headers. A refusal throws the
 * PdfRefusalError with the server's message.
 */
export async function fetchPdfFile(
    kind: PdfKind,
    documentId: string
): Promise<{ uri: string; headers: Headers }> {
    try {
        const { bytes, headers } = await fetchPdf(kind.key, documentId)
        return { uri: await pdfUriOf(kind.key, bytes), headers }
    } catch (error) {
        if (isExpectedRefusal(error)) {
            log.info('books.pdf', 'view refused', { status: error.status })
        } else {
            log.error('books.pdf', error)
        }
        throw error
    }
}

/**
 * The PDF of a saved sales document for the PDF view tab, fetched with the bearer token
 * as usePdfDownload does: a Blob URL on web, a cache file on native. `version` (the
 * document's `updated`) fetches it again after a save. Each mount fetches anew, so the
 * tab shows the last saved version. A refusal is not retried by itself: the tab shows
 * it with Retry.
 */
export function useDocumentPdf(kind: PdfKind, documentId: string | null, version = '') {
    const query = useQuery({
        queryKey: [`books.${kind.key}.pdf`, documentId, version],
        queryFn: async () => (await fetchPdfFile(kind, documentId ?? '')).uri,
        enabled: documentId !== null,
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
    })
    const uri = query.data ?? null
    // A Blob URL holds the bytes until it is revoked: free it when the next one
    // replaces it or the tab goes.
    useEffect(() => {
        if (uri === null || Platform.OS !== 'web') return
        return () => URL.revokeObjectURL(uri)
    }, [uri])
    const isLoading = documentId !== null && query.isFetching
    const error = !isLoading && query.error ? errorToString(query.error) : null
    return {
        uri: isLoading ? null : uri,
        isLoading,
        error,
        retry: () => {
            void query.refetch()
        },
    }
}
