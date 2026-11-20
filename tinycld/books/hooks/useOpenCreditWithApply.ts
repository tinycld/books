import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { type DocumentListRow, listDocumentHref } from '../lib/document-list'
import { useApplyCreditStore } from '../stores/apply-credit-store'

/**
 * The Apply row action of a credit's row (Apply to invoices of a credit memo, Apply to bills
 * of a vendor credit), on the Sales and Purchase lists and the customer page: it pushes the
 * credit's read view, so Back returns to the list, and opens the credit's apply dialog there
 * (`useApplyCreditStore`, drawn by the credit's read frame).
 */
export function useOpenCreditWithApply(): (row: DocumentListRow) => void {
    const orgHref = useOrgHref()
    return row => {
        router.push(orgHref(listDocumentHref(row.kind, row.id)))
        // After the push, so the credit's read frame, which draws the dialog, finds it.
        useApplyCreditStore.getState().open(row.id)
    }
}
