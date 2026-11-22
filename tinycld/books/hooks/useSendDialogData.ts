import { type Collection, eq, type InitialQueryBuilder, type UtilsRecord } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { materialize } from 'pbtsdb'
import type { DocumentEmailRecord } from '../lib/document-email'
import { type SendDialogStatus, type SendKind, sendDialogStatus } from '../lib/document-send'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import type { DocumentSendTarget } from '../stores/document-send-store'
import type { BooksCustomers } from '../types'
import { useEmailStatus } from './useEmailStatus'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The insert-input parameters are generic because a pbtsdb collection omits server-stamped
// fields on insert while a plain collection does not; the query reads rows only.
type Rows<T extends object, I extends object> = Collection<
    T,
    string | number,
    UtilsRecord,
    never,
    I
>

// The query of the Send dialog's document, the same for each kind: the document by id with
// its customer through `materialize()` in the same query. Only the target's kind runs it
// (`kind` is the target's), so the dialog makes one document read.
function sendDocumentQuery<
    T extends { id: string; customer: string },
    I extends object,
    CI extends object,
>(
    documents: Rows<T, I>,
    customers: Rows<BooksCustomers, CI>,
    target: { kind: SendKind | undefined; id: string },
    ownKind: SendKind
) {
    return (q: InitialQueryBuilder) => {
        if (target.kind !== ownKind || target.id === '') return undefined
        return q
            .from({ d: documents })
            .where(({ d }) => eq(d.id, target.id))
            .select(({ d }) => ({
                ...d,
                customerRow: materialize(
                    q
                        .from({ c: customers })
                        .where(({ c }) => eq(c.id, d.customer))
                        .findOne()
                ),
            }))
            .findOne()
    }
}

// What the dialog shows: 'not-found' when the document (or the customer it names) is gone
// once its read has settled. pbtsdb marks the read ready only after the materialized customer's
// load has settled, so a customer still loading is 'loading', never 'not-found'.
export type SendDialogDataStatus = SendDialogStatus | 'not-found'

/**
 * The reads of the Send dialog (spec §3.2 "Load", §4.1 "Dialog"): the document by id from
 * its kind's collection with its customer through `materialize()` in the same query
 * (sendDocumentQuery), the one `books_settings` row, `useEmailStatus()`, and the
 * organization's name (the starting texts name it when Books has no business name).
 * `status` comes from sendDialogStatus: 'ready' only once every read has landed and the
 * server can send, so the form and its editor mount with complete starting texts. A
 * document that is gone (deleted, no longer readable, or the customer it names not there)
 * once its read has landed is 'not-found': there is nothing to send and nothing to retry.
 * A document with no customer (a walk-in receipt) is ready with `customer` undefined. `retry`
 * is one `recoverLiveQueries` call over the failed reads.
 */
export function useSendDialogData(target: DocumentSendTarget | null) {
    const [invoices, estimates, salesReceipts, creditMemos, refundReceipts] = useStore(
        'books_invoices',
        'books_estimates',
        'books_sales_receipts',
        'books_credit_memos',
        'books_refund_receipts'
    )
    const [customers, settingsCollection] = useStore('books_customers', 'books_settings')
    const kind = target?.kind
    const id = target?.id ?? ''
    const on = { kind, id }
    const invoiceQuery = useLiveQuery({
        query: sendDocumentQuery(invoices, customers, on, 'invoice'),
        queryKey: ['books.send.invoice', id],
    })
    const estimateQuery = useLiveQuery({
        query: sendDocumentQuery(estimates, customers, on, 'estimate'),
        queryKey: ['books.send.estimate', id],
    })
    const salesReceiptQuery = useLiveQuery({
        query: sendDocumentQuery(salesReceipts, customers, on, 'sales_receipt'),
        queryKey: ['books.send.sales-receipt', id],
    })
    const creditMemoQuery = useLiveQuery({
        query: sendDocumentQuery(creditMemos, customers, on, 'credit_memo'),
        queryKey: ['books.send.credit-memo', id],
    })
    const refundReceiptQuery = useLiveQuery({
        query: sendDocumentQuery(refundReceipts, customers, on, 'refund_receipt'),
        queryKey: ['books.send.refund-receipt', id],
    })
    const settingsQuery = useLiveQuery({
        query: q => q.from({ settings: settingsCollection }).findOne(),
        queryKey: ['books.send.settings'],
    })
    const email = useEmailStatus()
    const orgInfo = useOrgInfo()

    // The target's document as the dialog reads it, and as the starting texts read it
    // (documentEmailInputOf), from its kind's query.
    const sendDoc = (() => {
        switch (kind) {
            case 'invoice': {
                const row = invoiceQuery.data
                const emailRecord: DocumentEmailRecord | undefined = row && { kind, record: row }
                return { query: invoiceQuery, source: invoices, row, emailRecord }
            }
            case 'estimate': {
                const row = estimateQuery.data
                const emailRecord: DocumentEmailRecord | undefined = row && { kind, record: row }
                return { query: estimateQuery, source: estimates, row, emailRecord }
            }
            case 'sales_receipt': {
                const row = salesReceiptQuery.data
                const emailRecord: DocumentEmailRecord | undefined = row && { kind, record: row }
                return { query: salesReceiptQuery, source: salesReceipts, row, emailRecord }
            }
            case 'credit_memo': {
                const row = creditMemoQuery.data
                const emailRecord: DocumentEmailRecord | undefined = row && { kind, record: row }
                return { query: creditMemoQuery, source: creditMemos, row, emailRecord }
            }
            case 'refund_receipt': {
                const row = refundReceiptQuery.data
                const emailRecord: DocumentEmailRecord | undefined = row && { kind, record: row }
                return { query: refundReceiptQuery, source: refundReceipts, row, emailRecord }
            }
            case undefined:
                return null
        }
    })()

    const row = sendDoc?.row
    const customer = row?.customerRow
    const documentQuery = sendDoc?.query
    const isDocumentLanded = documentQuery?.isReady === true && !documentQuery.isError
    // A settled read with no document, or a document that names a customer who is not
    // there. A walk-in sales or refund receipt names none (customer ''), and is sendable.
    const isCustomerGone = row !== undefined && row.customer !== '' && customer === undefined
    const isMissing = isDocumentLanded && (row === undefined || isCustomerGone)
    const isDocumentFailed = documentQuery?.isError === true
    const readStatus: SendDialogStatus =
        sendDoc === null
            ? 'loading'
            : sendDialogStatus({
                  reads: [
                      { isLoading: !sendDoc.query.isReady, isError: isDocumentFailed },
                      { isLoading: !settingsQuery.isReady, isError: settingsQuery.isError },
                      { isLoading: orgInfo.isPending, isError: false },
                  ],
                  email,
              })
    const status: SendDialogDataStatus = isMissing ? 'not-found' : readStatus
    const documentRecovery: LiveRecovery =
        sendDoc !== null && isDocumentFailed
            ? { queries: [sendDoc.query.collection], sources: [sendDoc.source, customers] }
            : NO_RECOVERY
    const settingsRecovery: LiveRecovery = settingsQuery.isError
        ? { queries: [settingsQuery.collection], sources: [settingsCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([documentRecovery, settingsRecovery]),
            onError: error => log.error('books.send.dialog', error),
        })
    }
    return {
        status,
        record: row,
        emailRecord: sendDoc?.emailRecord,
        customer,
        settings: settingsQuery.data,
        organizationName: orgInfo.org?.name ?? '',
        retry,
    }
}
