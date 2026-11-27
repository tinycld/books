import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { type DocumentListRow, listDocumentHref } from '../lib/document-list'
import { useCopyToBillStore } from '../stores/copy-to-bill-store'

/**
 * The Copy to bill row action of a purchase order's row, on the Purchase orders and All
 * purchases lists and the vendor page (purchase order spec §3.9): it pushes the order's read
 * view, so Back returns to the list, and asks for its Copy to bill dialog there
 * (`useCopyToBillStore.openOnRead`); the read view takes the request as the dialog's owner
 * once it has the focus, as its own Copy to bill (B) opens it.
 */
export function useOpenOrderWithCopyToBill(): (row: DocumentListRow) => void {
    const orgHref = useOrgHref()
    return row => {
        useCopyToBillStore.getState().openOnRead(row.id)
        router.push(orgHref(listDocumentHref(row.kind, row.key)))
    }
}
