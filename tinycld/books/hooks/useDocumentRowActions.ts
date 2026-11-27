import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { orderCloseBody } from '../lib/document-lifecycle'
import { type DocumentListRow, draftKindOf, type ListKind } from '../lib/document-list'
import {
    isVoidableListRow,
    type ListRowAction,
    listRowActionHref,
    listRowMenuItems,
    listVoidTexts,
} from '../lib/list-row-menu'
import { writeRefusalText } from '../lib/refusal'
import {
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    INVOICE_KIND,
    PURCHASE_ORDER_KIND,
    REFUND_RECEIPT_KIND,
    SALES_RECEIPT_KIND,
    type SalesDocumentKind,
} from '../lib/sales-document-kinds'
import { isSendDocType } from '../lib/send-doc-types'
import { type RowDialog, useDocumentListStore } from '../stores/document-list-store'
import { useDocumentSendStore } from '../stores/document-send-store'
import { useWriteOffStore } from '../stores/write-off-store'
import { useDeleteDraftDocument } from './useDeleteDraftDocument'
import { deleteDialogTexts } from './useDocumentDelete'
import { useOpenCreditWithApply } from './useOpenCreditWithApply'
import { useOpenOrderWithCopyToBill } from './useOpenOrderWithCopyToBill'
import { usePdfDownload } from './usePdfDownload'
import { usePurchaseOrderStatus } from './usePurchaseOrderStatus'
import { useVoidDocument } from './useVoidDocument'

// The kinds with a PDF: the sales documents and the purchase order; a payment and the
// other purchase kinds have none, so their menus never offer Download PDF.
export const PDF_KINDS: Partial<
    Record<ListKind, Pick<SalesDocumentKind, 'key' | 'pdfStem' | 'noun'>>
> = {
    invoice: INVOICE_KIND,
    estimate: ESTIMATE_KIND,
    sales_receipt: SALES_RECEIPT_KIND,
    credit_memo: CREDIT_MEMO_KIND,
    refund_receipt: REFUND_RECEIPT_KIND,
    purchase_order: PURCHASE_ORDER_KIND,
}

type DialogAction = RowDialog['action']

// The menu rows that start a write: they wait for writes to be available and for a
// running write.
const WRITING_ROW_ACTIONS: ReadonlySet<ListRowAction> = new Set<ListRowAction>([
    'void',
    'delete_draft',
    'delete',
    'close',
    'write_off',
])

// A dialog shows while its row is listed and its menu still offers the action, or while
// its own write runs: a row voided, posted, closed or deleted elsewhere closes it.
function isStillOffered(
    target: RowDialog | null,
    action: DialogAction,
    rows: readonly DocumentListRow[],
    access: { canWrite: boolean; isAdmin: boolean }
): boolean {
    if (target === null || target.action !== action) return false
    const live = rows.find(row => row.id === target.row.id)
    if (live === undefined) return false
    return listRowMenuItems(live, access.canWrite, access.isAdmin).includes(action)
}

// The Delete dialog's words: a purchase order's own (deleteDialogTexts, "Delete purchase
// order 1004?"); a draft's are the dialog's own. The list's test ids stay.
function deleteTextsOf(target: RowDialog | null) {
    if (target?.action !== 'delete') return {}
    const { testIdPrefix: _ids, ...texts } = deleteDialogTexts(
        PURCHASE_ORDER_KIND,
        target.row.number
    )
    return texts
}

interface RowActionsInput {
    // The mounted list that opens the dialog: its dialog shows only on that list.
    listKey: string
    // The `useId()` of the list screen, which mounts its one WriteOffDialog and its one
    // SendDocumentDialog with it.
    owner: string
    rows: readonly DocumentListRow[]
    canWrite: boolean
    // A Books admin: a purchase order's menu adds Close.
    isAdmin: boolean
    // The list's open (`useDocumentListScreen().openRow`).
    openRow(row: DocumentListRow): void
}

/**
 * The actions of a list's row menus, sales and purchases (spec §3 "Row menu"), as the read
 * view runs them: Open opens the row; Receive payment, Pay bill, Copy, Create credit memo,
 * Record refund, View journal entry and Open invoice push their route
 * (`listRowActionHref`), so Back returns to the list; Apply (Apply to bills of a vendor
 * credit, Apply to invoices of a credit memo) pushes the credit and opens its apply dialog
 * there (`useOpenCreditWithApply`); Download PDF saves the server's PDF; Void and Delete
 * draft open their confirm dialog over the list, with the kind's own Void texts
 * (`listVoidTexts`). A
 * dialog's write is the one the read view and the forms share (`useVoidDocument`,
 * `useDeleteDraftDocument`); a refusal closes the dialog and shows in the list's banner.
 * Write off opens the write-off dialog over the list (`useWriteOffStore` with the list's
 * `owner`); that dialog shows its own refusals and the list stays. Send… opens the Send
 * dialog over the list (`useDocumentSendStore` with the list's `owner`, as the read view
 * opens it); it is not disabled offline, as the read view's Send… is not: the dialog's
 * Send waits for the server.
 */
export function useDocumentRowActions({
    listKey,
    owner,
    rows,
    canWrite,
    isAdmin,
    openRow,
}: RowActionsInput) {
    const orgHref = useOrgHref()
    const writes = useWritesAvailable()
    const openWriteOff = useWriteOffStore(state => state.open)
    const openSend = useDocumentSendStore(state => state.open)
    const setBanner = useDocumentListStore(state => state.setBanner)
    const stored = useDocumentListStore(state => state.rowDialog)
    const setRowDialog = useDocumentListStore(state => state.setRowDialog)
    const voidWrite = useVoidDocument()
    const deleteWrite = useDeleteDraftDocument()
    const download = usePdfDownload()
    const openCreditWithApply = useOpenCreditWithApply()
    const openOrderWithCopyToBill = useOpenOrderWithCopyToBill()
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
    // A draft's Delete and a purchase order's Delete (an open order that no bill names) are
    // the same write of the row's kind.
    const deleteDraft = useMutation({
        mutationFn: function* (row: DocumentListRow) {
            yield deleteWrite(draftKindOf(row), row.id)
        },
        onSuccess: close,
        onError: refuse,
    })
    // A purchase order's Close: its refusal shows in a toast (usePurchaseOrderStatus), and
    // the dialog closes either way.
    const status = usePurchaseOrderStatus(close)
    const isWriting = voidDocument.isPending || deleteDraft.isPending || status.isClosing

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
    const run = (row: DocumentListRow, action: ListRowAction) => {
        if (action === 'open') {
            openRow(row)
            return
        }
        if (action === 'pdf') {
            downloadPdf(row)
            return
        }
        if (action === 'void' || action === 'delete_draft' || action === 'delete') {
            openDialog(action, row)
            return
        }
        if (action === 'close') {
            openDialog('close', row)
            return
        }
        if (action === 'copy_to_bill') {
            openOrderWithCopyToBill(row)
            return
        }
        if (action === 'write_off') {
            setBanner(null)
            openWriteOff(row.id, owner)
            return
        }
        if (action === 'send') {
            if (!isSendDocType(row.kind)) return
            setBanner(null)
            openSend({ kind: row.kind, id: row.id }, owner)
            return
        }
        if (action === 'apply_credit') {
            openCreditWithApply(row)
            return
        }
        const href = listRowActionHref(row, action)
        if (href === null) return
        router.push(orgHref(href))
    }
    // The menu rows that start a write (WRITING_ROW_ACTIONS) wait for writes to be available
    // and for a running write; Download PDF waits for its download.
    const isDisabled = (action: ListRowAction) => {
        if (WRITING_ROW_ACTIONS.has(action)) return isWriting || !writes.available
        if (action === 'pdf') return download.isPending
        return false
    }

    const access = { canWrite, isAdmin }
    // Only a Void target's words are read: a purchase order has no Void texts.
    const voidRow =
        target?.action === 'void' && isVoidableListRow(target.row) ? target.row : undefined
    const voidTexts = voidRow === undefined ? null : listVoidTexts(voidRow)
    const isVoidOffered = isStillOffered(target, 'void', rows, access)
    const isDeleteOffered =
        isStillOffered(target, 'delete_draft', rows, access) ||
        isStillOffered(target, 'delete', rows, access)
    const isCloseOffered = isStillOffered(target, 'close', rows, access)
    // Marked running, so the list's blur cleanup leaves the dialog to its write.
    const confirmWith = (mutation: typeof voidDocument) => () => {
        if (target === null) return
        setRowDialog({ ...target, isRunning: true })
        mutation.mutate(target.row)
    }
    const voidDialog = {
        isVisible: isVoidOffered || voidDocument.isPending,
        entryNumber: `${voidTexts?.noun ?? ''} ${voidRow?.number ?? ''}`,
        confirmLabel: voidTexts?.confirmLabel ?? '',
        body: voidTexts?.body,
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
        ...deleteTextsOf(target),
    }
    const closeRow = target?.action === 'close' ? target.row : undefined
    // The Close states the revision the row shows (usePurchaseOrderStatus). Only a purchase
    // order's row offers Close, and every one carries its revision (useDocumentList).
    const confirmClose = () => {
        const revision = target?.row.revision
        if (target === null || revision === undefined) return
        setRowDialog({ ...target, isRunning: true })
        status.close({ id: target.row.id, revision })
    }
    const closeDialog = {
        isVisible: isCloseOffered || status.isClosing,
        number: closeRow?.number ?? '',
        body: closeRow
            ? orderCloseBody(closeRow.openLines ?? 0, closeRow.balance, closeRow.currency)
            : '',
        isPending: status.isClosing,
        onConfirm: confirmClose,
        onCancel: close,
    }
    return { run, isDisabled, voidDialog, deleteDialog, closeDialog }
}

export type DocumentRowActions = ReturnType<typeof useDocumentRowActions>
