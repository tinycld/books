import { useQuery } from '@tanstack/react-query'
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { isExpectedRefusal } from '../lib/pdf-download'
import { fetchPdf } from './usePdfDownload'

const VIEW_DIR_PREFIX = 'books-pdf-view-'

// Native: the bytes go to a cache file the viewer reads. The file of the last view is
// deleted by the next one, so at most one directory remains. Lazily imported, as
// usePdfDownload does: a module-init failure must not break the screen.
async function cacheFile(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
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
    const target = new File(dir, 'invoice.pdf')
    target.create()
    await target.write(bytes)
    return target.uri
}

async function fetchInvoicePdf(invoiceId: string): Promise<string> {
    try {
        const { bytes } = await fetchPdf('invoice', invoiceId)
        if (Platform.OS === 'web') {
            return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        }
        return await cacheFile(bytes)
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
 * The PDF of a saved invoice for the PDF view tab, fetched with the bearer token as
 * usePdfDownload does: a Blob URL on web, a cache file on native. `version` (the
 * invoice's `updated`) fetches it again after a save. Each mount fetches anew, so the
 * tab shows the last saved version. A refusal is not retried by itself: the tab shows
 * it with Retry.
 */
export function useInvoicePdf(invoiceId: string | null, version = '') {
    const query = useQuery({
        queryKey: ['books.invoice.pdf', invoiceId, version],
        queryFn: () => fetchInvoicePdf(invoiceId ?? ''),
        enabled: invoiceId !== null,
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
    const isLoading = invoiceId !== null && query.isFetching
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
