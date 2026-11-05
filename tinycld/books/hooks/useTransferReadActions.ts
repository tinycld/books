import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { useState } from 'react'
import { entryActions } from '../lib/entry-actions'
import { entryNumberText } from '../lib/entry-display'
import { entryEditHref } from '../lib/entry-route'
import { useEntryDialogs } from './useEntryDialogs'
import type { ReadyTransferDetail } from './useTransferDetail'

// The void dialog's open state lives here, on the read view, which stays mounted while the
// optimistic void changes the entry under it, so a refusal stays visible in its dialog.
export function useTransferReadActions(detail: ReadyTransferDetail) {
    const { entry, canWrite } = detail
    const orgHref = useOrgHref()
    const [isVoidOpen, setVoidOpen] = useState(false)
    const onClose = () => setVoidOpen(false)
    const dialogs = useEntryDialogs(entry.id, { navigation: 'replace', onClose })

    // A transfer is never reversed in one click, so `reverse` is never offered.
    const actions = entryActions(
        { status: entry.status, origin: entry.origin, doc_type: entry.doc_type, isReversed: false },
        { canWrite }
    )

    return {
        actions,
        entryNumber: entryNumberText(entry),
        isVoidOpen,
        isVoiding: dialogs.isVoiding,
        voidError: dialogs.voidError,
        // Replace, not push: a pushed screen leaves this one mounted under it.
        onEdit: () => router.replace(orgHref(entryEditHref(entry))),
        onVoid: () => {
            dialogs.clearErrors()
            setVoidOpen(true)
        },
        onClose,
        confirmVoid: dialogs.confirmVoid,
    }
}
