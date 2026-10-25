import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { useState } from 'react'
import { entryActions } from '../lib/entry-actions'
import { entryNumberText } from '../lib/entry-display'
import { defaultReverseDate } from '../lib/entry-schema'
import { todayIso } from '../lib/register-range'
import type { ReadyEntryDetail } from './useEntryDetail'
import { useEntryDialogs } from './useEntryDialogs'

type OpenDialog = 'reverse' | 'void' | null

// Dialog state lives here, on the read-only view, which stays mounted while an action's
// optimistic write changes the entry under it, so a refusal stays visible in its dialog.
export function useReadOnlyActions(detail: ReadyEntryDetail) {
    const { entry, canWrite, reversedBy } = detail
    const orgHref = useOrgHref()
    const [open, setOpen] = useState<OpenDialog>(null)
    const onClose = () => setOpen(null)
    const dialogs = useEntryDialogs(entry.id, { navigation: 'replace', onClose })

    const actions = entryActions(
        { status: entry.status, origin: entry.origin, isReversed: reversedBy?.status === 'posted' },
        { canWrite }
    )

    return {
        actions,
        entryNumber: entryNumberText(entry),
        reverseDate: defaultReverseDate(entry.date, todayIso()),
        openDialog: open,
        isReversing: dialogs.isReversing,
        isVoiding: dialogs.isVoiding,
        voidError: dialogs.voidError,
        // Replace, not push: a pushed screen leaves this one mounted under it, and two
        // entry screens would share one page.
        onEdit: () => router.replace(orgHref(`books/entries/new?replaces=${entry.id}`)),
        onReverse: () => setOpen('reverse'),
        onVoid: () => {
            dialogs.clearErrors()
            setOpen('void')
        },
        onClose,
        confirmReverse: dialogs.confirmReverse,
        confirmVoid: dialogs.confirmVoid,
    }
}
