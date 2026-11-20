import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { STATEMENT_PDF_ERROR } from '../lib/statement-texts'
import { fetchPdfFile, type PdfKind } from './useDocumentPdf'

const STATEMENT_KIND: PdfKind = { key: 'statement' }

// The route's header with the amount due as the ledger gives it now, in integer cents
// (server/pdf_routes.go statementAmountDueHeader).
const AMOUNT_DUE_HEADER = 'X-Books-Statement-Amount-Due'

// The header's integer, or null when it is absent or holds no integer.
function amountDueOf(headers: Headers): number | null {
    const text = headers.get(AMOUNT_DUE_HEADER)
    if (text === null || !/^-?\d+$/.test(text.trim())) return null
    return Number(text.trim())
}

/**
 * A stored statement's PDF for its screen (statements spec §3.6, §3.8): the server builds it
 * at each open from the ledger as it is now, so each mount fetches anew. `version` (the
 * row's `updated`) fetches it again after a send. `amountDueNow` is the amount due of that
 * PDF, from the route's header, or null when the header is absent; the screen compares it
 * with the stored `balance`. A failure is not retried by itself: `error` holds the screen's
 * text and `retry` fetches again (fetchPdfFile logs the server's refusal).
 */
export function useStatementPdf(id: string, version: string) {
    const query = useQuery({
        queryKey: ['books', 'statement-pdf', id, version],
        queryFn: async () => {
            const { uri, headers } = await fetchPdfFile(STATEMENT_KIND, id)
            return { uri, amountDueNow: amountDueOf(headers) }
        },
        enabled: id !== '',
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
    })
    const uri = query.data?.uri ?? null
    // A Blob URL holds the bytes until it is revoked: free it when the next one replaces it
    // or the screen goes.
    useEffect(() => {
        if (uri === null || Platform.OS !== 'web') return
        return () => URL.revokeObjectURL(uri)
    }, [uri])
    const isLoading = id !== '' && query.isFetching
    const error = !isLoading && query.isError ? STATEMENT_PDF_ERROR : null
    const amountDueNow = isLoading ? null : (query.data?.amountDueNow ?? null)
    return {
        uri: isLoading ? null : uri,
        error,
        retry: () => {
            void query.refetch()
        },
        amountDueNow,
    }
}
