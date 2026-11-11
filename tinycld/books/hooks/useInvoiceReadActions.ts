import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { formatHint } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { useState } from 'react'
import type { InvoiceMoreItem } from '../components/invoices/InvoiceActionBar'
import {
    INVOICE_READ_ACTION_KEYS,
    type InvoiceReadAction,
    invoicePdfStem,
    invoiceReadActions,
} from '../lib/invoice-actions'
import { invoiceNewHref } from '../lib/invoice-routes'
import { writeRefusalText } from '../lib/refusal'
import type { BooksInvoices } from '../types'
import { usePdfDownload } from './usePdfDownload'

type ReadInvoice = Pick<BooksInvoices, 'id' | 'status' | 'number' | 'entry'>

const LABELS: Record<InvoiceReadAction, string> = {
    edit: 'Edit',
    void: 'Void',
    copy: 'Copy',
    entry: 'View journal entry',
    pdf: 'Download PDF',
}

// A bar or More row of the read view, with the action it runs (its key comes from it).
export type InvoiceReadItem = InvoiceMoreItem & { action: InvoiceReadAction }

// The offered actions in the read view's order; View journal entry needs the entry the
// post wrote.
function offeredActionsOf(invoice: ReadInvoice, canWrite: boolean): InvoiceReadAction[] {
    return invoiceReadActions(invoice.status, canWrite).filter(
        action => action !== 'entry' || invoice.entry !== ''
    )
}

/**
 * The read view's actions of a posted or void invoice, as rows the bar draws (a button
 * each on a wide screen; Edit and a More menu on a phone), and the Void dialog. Edit,
 * Copy and View journal entry replace the read view (a pushed screen would stay mounted
 * under the new one); Download PDF saves the server's PDF through usePdfDownload. Void writes `status: 'void'`; the dialog's open state lives here,
 * on the read view, which stays mounted while the optimistic void changes the invoice
 * under it, so a refusal stays visible in the dialog.
 */
export function useInvoiceReadActions(invoice: ReadInvoice, canWrite: boolean) {
    const orgHref = useOrgHref()
    const [invoicesCollection] = useStore('books_invoices')
    const [isVoidOpen, setVoidOpen] = useState(false)
    const voidInvoice = useMutation({
        mutationFn: function* (id: string) {
            yield invoicesCollection.update(id, draft => {
                draft.status = 'void'
            })
        },
        onSuccess: () => setVoidOpen(false),
    })
    const isVoiding = voidInvoice.isPending
    const voidState = useServerActionState({ isDisabled: isVoiding })
    const download = usePdfDownload()
    const run: Record<InvoiceReadAction, () => void> = {
        edit: () => router.replace(orgHref(invoiceNewHref({ replaces: invoice.id }))),
        void: () => {
            voidInvoice.reset()
            setVoidOpen(true)
        },
        copy: () => router.replace(orgHref(invoiceNewHref({ copy: invoice.id }))),
        entry: () => router.replace(orgHref(`books/entries/${invoice.entry}`)),
        pdf: () =>
            download.mutate({
                kind: 'invoice',
                id: invoice.id,
                fallbackName: invoicePdfStem(invoice.number),
            }),
    }
    // Void writes, so it waits for the server; Download PDF waits for its download; the
    // others only open a screen.
    const disabledOf = (action: InvoiceReadAction) => {
        if (action === 'void') return voidState.isDisabled
        if (action === 'pdf') return download.isPending
        return isVoiding
    }
    const actions: InvoiceReadItem[] = offeredActionsOf(invoice, canWrite).map(action => ({
        action,
        id: `read-${action}`,
        label: LABELS[action],
        keys: formatHint(INVOICE_READ_ACTION_KEYS[action]).text,
        isDisabled: disabledOf(action),
        isDestructive: action === 'void',
        onSelect: run[action],
    }))
    // The dialog closes when Void stops being offered (the invoice was voided or
    // replaced elsewhere while it was open), unless this dialog's own void runs.
    const isVoidOffered = actions.some(item => item.id === 'read-void')
    const voidDialog = {
        isVisible: isVoidOpen && (isVoidOffered || isVoiding),
        entryNumber: `invoice ${invoice.number}`,
        confirmLabel: 'Void invoice',
        isPending: isVoiding,
        errorMessage: voidInvoice.error ? writeRefusalText(voidInvoice.error) : null,
        onConfirm: () => voidInvoice.mutate(invoice.id),
        onCancel: () => setVoidOpen(false),
    }
    return { actions, voidDialog }
}
