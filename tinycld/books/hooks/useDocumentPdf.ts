import { useQuery } from '@tanstack/react-query'
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { isExpectedRefusal } from '../lib/pdf-download'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import { fetchPdf } from './usePdfDownload'

type PdfKind = Pick<SalesDocumentKind, 'key'>

const VIEW_DIR_PREFIX = 'books-pdf-view-'

// Native: the bytes go to a cache file the viewer reads. The file of the last view is
// deleted by the next one, so at most one directory remains. Lazily imported, as
// usePdfDownload does: a module-init failure must not break the screen. The file is
// named by the kind's key (`invoice.pdf`).
async function cacheFile(kind: PdfKind, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
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
    const target = new File(dir, `${kind.key}.pdf`)
    target.create()
    await target.write(bytes)
    return target.uri
}

async function fetchDocumentPdf(kind: PdfKind, documentId: string): Promise<string> {
    try {
        const { bytes } = await fetchPdf(kind.key, documentId)
        if (Platform.OS === 'web') {
            return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        }
        return await cacheFile(kind, bytes)
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
        queryFn: () => fetchDocumentPdf(kind, documentId ?? ''),
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
