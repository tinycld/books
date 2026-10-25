import { errorToString } from '@tinycld/core/lib/errors'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { entryActions } from '../lib/entry-actions'
import { entryNumberText } from '../lib/entry-display'
import { defaultReverseDate, type ReverseValues } from '../lib/entry-schema'
import { todayIso } from '../lib/register-range'
import { useEntryActions } from './useEntryActions'
import type { ReadyEntryDetail } from './useEntryDetail'

type OpenDialog = 'reverse' | 'void' | null

// Dialog state lives here, on the read-only view, which stays mounted while an action's
// optimistic write changes the entry under it, so a refusal stays visible in its dialog.
export function useReadOnlyActions(detail: ReadyEntryDetail) {
    const { entry, canWrite, reversedBy } = detail
    const orgHref = useOrgHref()
    const { reverse, voidEntry, isReversing, isVoiding } = useEntryActions(entry.id)
    const [open, setOpen] = useState<OpenDialog>(null)
    const [voidError, setVoidError] = useState<string | null>(null)

    const actions = entryActions(
        { status: entry.status, origin: entry.origin, isReversed: reversedBy?.status === 'posted' },
        { canWrite }
    )

    // Set by the unmount cleanup: a reverse that finishes after the user left must still
    // complete, but must not pull them to the reversal.
    const isLive = useRef(true)
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
        }
    }, [])

    const confirmReverse = async (values: ReverseValues) => {
        const id = await reverse(values)
        if (!isLive.current) return
        setOpen(null)
        router.replace(orgHref(`books/entries/${id}`))
    }

    const confirmVoid = async () => {
        setVoidError(null)
        try {
            await voidEntry()
            setOpen(null)
        } catch (error) {
            setVoidError(errorToString(error))
        }
    }

    return {
        actions,
        entryNumber: entryNumberText(entry),
        reverseDate: defaultReverseDate(entry.date, todayIso()),
        openDialog: open,
        isReversing,
        isVoiding,
        voidError,
        // Replace, not push: a pushed screen leaves this one mounted under it, and two
        // entry screens would share one page.
        onEdit: () => router.replace(orgHref(`books/entries/new?replaces=${entry.id}`)),
        onReverse: () => setOpen('reverse'),
        onVoid: () => {
            setVoidError(null)
            setOpen('void')
        },
        onClose: () => setOpen(null),
        confirmReverse,
        confirmVoid,
    }
}
