import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import type { DocumentListRow } from '../lib/document-list'
import { documentRowMenuItems, type RowMenuAction, rowActionHref } from '../lib/document-row-menu'
import { TRANSACTION_TYPE_LABELS, type TransactionKind } from '../lib/party-transactions'
import { PAYMENT_MESSAGES } from '../lib/payment-texts'
import { writeRefusalText } from '../lib/refusal'
import {
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from '../lib/sales-document-kinds'
import { type RowDialog, useDocumentListStore } from '../stores/document-list-store'
import { useDeleteDraftDocument } from './useDeleteDraftDocument'
import { usePdfDownload } from './usePdfDownload'
import { useVoidDocument } from './useVoidDocument'

// The kinds with a PDF; a payment has none, so its menu never offers Download PDF.
const PDF_KINDS: Partial<Record<TransactionKind, Pick<SalesDocumentKind, 'key' | 'pdfStem'>>> = {
    invoice: INVOICE_KIND,
    estimate: ESTIMATE_KIND,
    sales_receipt: SALES_RECEIPT_KIND,
    credit_memo: CREDIT_MEMO_KIND,
}

type DialogAction = RowDialog['action']

// A dialog shows while its row is listed and its menu still offers the action, or while
// its own write runs: a row voided, posted or deleted elsewhere closes it.
function isStillOffered(
    target: RowDialog | null,
    action: DialogAction,
    rows: readonly DocumentListRow[],
    canWrite: boolean
): boolean {
    if (target === null || target.action !== action) return false
    const live = rows.find(row => row.id === target.row.id)
    if (live === undefined) return false
    return documentRowMenuItems(live, canWrite).includes(action)
}

interface RowActionsInput {
    // The tab of the list: its dialog shows only on its own list.
    listKey: string
    rows: readonly DocumentListRow[]
    canWrite: boolean
    // The list's open (`useDocumentListScreen().openRow`).
    openRow(row: DocumentListRow): void
}

/**
 * The actions of a Sales list's row menus (spec §3 "Row menu"), as the read view runs
 * them: Open opens the row; Receive payment, Copy, Create credit memo, View journal entry
 * and Open invoice push their route, so Back returns to the list; Download PDF saves the
 * server's PDF; Void and Delete draft open their confirm dialog over the list. A dialog's
 * write is the one the read view and the forms share (`useVoidDocument`,
 * `useDeleteDraftDocument`); a refusal closes the dialog and shows in the list's banner.
 */
export function useDocumentRowActions({ listKey, rows, canWrite, openRow }: RowActionsInput) {
    const orgHref = useOrgHref()
    const writes = useWritesAvailable()
    const setBanner = useDocumentListStore(state => state.setBanner)
    const stored = useDocumentListStore(state => state.rowDialog)
    const setRowDialog = useDocumentListStore(state => state.setRowDialog)
    const voidWrite = useVoidDocument()
    const deleteWrite = useDeleteDraftDocument()
    const download = usePdfDownload()
    const target = stored?.listKey === listKey ? stored : null
    const close = () => setRowDialog(null)
    const refuse = (error: unknown) => {
        setRowDialog(null)
        setBanner(writeRefusalText(error))
    }
    const voidDocument = useMutation({
        mutationFn: function* (row: DocumentListRow) {
            yield voidWrite(row.kind, row.id)
        },
        onSuccess: close,
        // The banner shows the refusal; without this core reports it again as a toast.
        onError: refuse,
    })
    const deleteDraft = useMutation({
        mutationFn: function* (row: DocumentListRow) {
            yield deleteWrite(row.kind, row.id)
        },
        onSuccess: close,
        onError: refuse,
    })
    const isWriting = voidDocument.isPending || deleteDraft.isPending

    const openDialog = (action: DialogAction, row: DocumentListRow) => {
        voidDocument.reset()
        deleteDraft.reset()
        setBanner(null)
        setRowDialog({ listKey, action, row, isRunning: false })
    }
    const downloadPdf = (row: DocumentListRow) => {
        const kind = PDF_KINDS[row.kind]
        if (kind === undefined) return
        download.mutate({ kind: kind.key, id: row.id, fallbackName: kind.pdfStem(row.number) })
    }
    const run = (row: DocumentListRow, action: RowMenuAction) => {
        if (action === 'open') {
            openRow(row)
            return
        }
        if (action === 'pdf') {
            downloadPdf(row)
            return
        }
        if (action === 'void' || action === 'delete_draft') {
            openDialog(action, row)
            return
        }
        const href = rowActionHref(row, action)
        if (href !== null) router.push(orgHref(href))
    }
    // The menu rows that start a write wait for writes to be available and for a running
    // write; Download PDF waits for its download.
    const isDisabled = (action: RowMenuAction) => {
        if (action === 'void' || action === 'delete_draft') return isWriting || !writes.available
        if (action === 'pdf') return download.isPending
        return false
    }

    const voidRow = target?.row
    const noun = voidRow === undefined ? '' : TRANSACTION_TYPE_LABELS[voidRow.kind].toLowerCase()
    const voidBody = voidRow?.kind === 'payment' ? PAYMENT_MESSAGES.voidBody : undefined
    const isVoidOffered = isStillOffered(target, 'void', rows, canWrite)
    const isDeleteOffered = isStillOffered(target, 'delete_draft', rows, canWrite)
    // Marked running, so the list's blur cleanup leaves the dialog to its write.
    const confirmWith = (mutation: typeof voidDocument) => () => {
        if (target === null) return
        setRowDialog({ ...target, isRunning: true })
        mutation.mutate(target.row)
    }
    const voidDialog = {
        isVisible: isVoidOffered || voidDocument.isPending,
        entryNumber: `${noun} ${voidRow?.number ?? ''}`,
        confirmLabel: `Void ${noun}`,
        body: voidBody,
        isPending: voidDocument.isPending,
        errorMessage: null,
        onConfirm: confirmWith(voidDocument),
        onCancel: close,
    }
    const deleteDialog = {
        isVisible: isDeleteOffered || deleteDraft.isPending,
        isPending: deleteDraft.isPending,
        onConfirm: confirmWith(deleteDraft),
        onCancel: close,
    }
    return { run, isDisabled, voidDialog, deleteDialog }
}

export type DocumentRowActions = ReturnType<typeof useDocumentRowActions>
