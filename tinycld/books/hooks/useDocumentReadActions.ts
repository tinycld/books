import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { formatHint } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { useState } from 'react'
import type { DocumentMoreItem } from '../components/documents/DocumentActionBar'
import type { DocumentKind } from '../components/documents/document-kinds'
import {
    DOCUMENT_READ_ACTION_KEYS,
    type DocumentReadAction,
    documentReadActions,
} from '../lib/document-actions'
import { quoteReadActions } from '../lib/document-lifecycle'
import { documentNewHref } from '../lib/document-routes'
import { writeRefusalText } from '../lib/refusal'
import type { DocumentLifecycle } from '../lib/sales-document-kinds'
import type { DocumentRecord } from './document-data'
import { usePdfDownload } from './usePdfDownload'

type ReadRecord = Pick<DocumentRecord, 'id' | 'status' | 'number' | 'entry' | 'kindFields'>

const LABELS: Record<DocumentReadAction, string> = {
    edit: 'Edit',
    void: 'Void',
    copy: 'Copy',
    entry: 'View journal entry',
    pdf: 'Download PDF',
}

// A bar or More row of the read view, with the action it runs (its key comes from it).
export type DocumentReadItem = DocumentMoreItem & { action: DocumentReadAction }

// The offered actions in the read view's order, by the kind's lifecycle; View journal
// entry needs the entry the post wrote.
function offeredActionsOf(
    lifecycle: DocumentLifecycle,
    record: ReadRecord,
    canWrite: boolean
): DocumentReadAction[] {
    if (lifecycle === 'quote') {
        const hasInvoice = record.kindFields.kind === 'estimate' && record.kindFields.invoice !== ''
        return quoteReadActions(record.status, canWrite, hasInvoice)
    }
    return documentReadActions(record.status, canWrite).filter(
        action => action !== 'entry' || record.entry !== ''
    )
}

/**
 * The read view's actions of a posted or void sales document, or of a quote the read
 * view shows (a closed estimate, or any estimate for a reader), as rows the bar draws (a
 * button each on a wide screen; Edit and a More menu on a phone), and the Void dialog.
 * Edit, Copy and View journal entry replace the read view (a pushed screen would stay
 * mounted under the new one); Download PDF saves the server's PDF through usePdfDownload.
 * Void writes `status: 'void'` through the kind's data source; the dialog's open state
 * lives here, on the read view, which stays mounted while the optimistic void changes the
 * document under it, so a refusal stays visible in the dialog.
 */
export function useDocumentReadActions(
    documentKind: DocumentKind,
    record: ReadRecord,
    canWrite: boolean
) {
    const { doc } = documentKind
    const orgHref = useOrgHref()
    const writes = documentKind.data.useWrites()
    const [isVoidOpen, setVoidOpen] = useState(false)
    const voidDocument = useMutation({
        mutationFn: function* (id: string) {
            yield writes.setStatus(id, 'void')
        },
        onSuccess: () => setVoidOpen(false),
    })
    const isVoiding = voidDocument.isPending
    const voidState = useServerActionState({ isDisabled: isVoiding })
    const download = usePdfDownload()
    const run: Record<DocumentReadAction, () => void> = {
        edit: () => router.replace(orgHref(documentNewHref(doc, { replaces: record.id }))),
        void: () => {
            voidDocument.reset()
            setVoidOpen(true)
        },
        copy: () => router.replace(orgHref(documentNewHref(doc, { copy: record.id }))),
        entry: () => router.replace(orgHref(`books/entries/${record.entry}`)),
        pdf: () =>
            download.mutate({
                kind: doc.key,
                id: record.id,
                fallbackName: doc.pdfStem(record.number),
            }),
    }
    // Void writes, so it waits for the server; Download PDF waits for its download; the
    // others only open a screen.
    const disabledOf = (action: DocumentReadAction) => {
        if (action === 'void') return voidState.isDisabled
        if (action === 'pdf') return download.isPending
        return isVoiding
    }
    const actions: DocumentReadItem[] = offeredActionsOf(doc.lifecycle, record, canWrite).map(
        action => ({
            action,
            id: `read-${action}`,
            label: LABELS[action],
            keys: formatHint(DOCUMENT_READ_ACTION_KEYS[action]).text,
            isDisabled: disabledOf(action),
            isDestructive: action === 'void',
            onSelect: run[action],
        })
    )
    // The dialog closes when Void stops being offered (the document was voided or
    // replaced elsewhere while it was open), unless this dialog's own void runs.
    const isVoidOffered = actions.some(item => item.id === 'read-void')
    const noun = doc.noun.toLowerCase()
    const voidDialog = {
        isVisible: isVoidOpen && (isVoidOffered || isVoiding),
        entryNumber: `${noun} ${record.number}`,
        confirmLabel: `Void ${noun}`,
        isPending: isVoiding,
        errorMessage: voidDocument.error ? writeRefusalText(voidDocument.error) : null,
        onConfirm: () => voidDocument.mutate(record.id),
        onCancel: () => setVoidOpen(false),
    }
    return { actions, voidDialog }
}
