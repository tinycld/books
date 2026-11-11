import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * The tax lines the server wrote when the invoice was posted (the tax-rates snapshot), in
 * position order: the read view's tax line reads them, so a rate changed after posting
 * does not change a posted invoice. An empty id reads nothing and reports ready.
 * `recovery` is non-empty only when this read failed, for the screen's one Retry.
 */
export function useInvoiceTaxLines(invoiceId: string) {
    const [taxLinesCollection] = useStore('books_invoice_tax_lines')
    const query = useLiveQuery({
        query: q => {
            if (!invoiceId) return undefined
            return q
                .from({ line: taxLinesCollection })
                .where(({ line }) => eq(line.invoice, invoiceId))
                .orderBy(({ line }) => line.position)
        },
        queryKey: ['books.invoice.tax-lines', invoiceId],
    })
    const recovery: LiveRecovery =
        query.isError && query.collection
            ? { queries: [query.collection], sources: [taxLinesCollection] }
            : NO_RECOVERY
    return {
        rows: query.data ?? [],
        // A disabled query reports ready, so the id is checked as well.
        isReady: !invoiceId || (query.isEnabled && query.isReady),
        isError: query.isError,
        recovery,
    }
}
