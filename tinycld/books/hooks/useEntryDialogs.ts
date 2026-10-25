import { errorToString } from '@tinycld/core/lib/errors'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import type { ReverseValues } from '../lib/entry-schema'
import { useEntryActions } from './useEntryActions'

interface EntryDialogOptions {
    // The read-only view replaces itself with the reversal (a pushed entry screen would stay
    // mounted under it); the list pushes, so the list remains under the reversal.
    navigation: 'push' | 'replace'
    // Closes the caller's dialog; its open state lives with the caller.
    onClose: () => void
}

// The confirm logic of the reverse, void and delete dialogs, shared by the read-only view and
// the list. The caller keeps the open state above anything that unmounts on an optimistic
// rollback, so a refusal stays visible in its dialog.
export function useEntryDialogs(entryId: string, { navigation, onClose }: EntryDialogOptions) {
    const orgHref = useOrgHref()
    const { reverse, voidEntry, deleteDraft, isReversing, isVoiding, isPending } =
        useEntryActions(entryId)
    const [voidError, setVoidError] = useState<string | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    // Cleared on blur or unmount: a pushed route leaves this screen mounted, and a reverse that
    // finishes after the user left must still complete, but must not pull them to the reversal.
    const isLive = useRef(true)
    useFocusEffect(
        useCallback(() => {
            isLive.current = true
            return () => {
                isLive.current = false
            }
        }, [])
    )

    const confirmReverse = async (values: ReverseValues) => {
        const id = await reverse(values)
        // Read before onClose(): closing can unmount this hook's host and clear the flag.
        const stillLive = isLive.current
        onClose()
        if (!stillLive) return
        router[navigation](orgHref(`books/entries/${id}`))
    }

    const confirmVoid = async () => {
        setVoidError(null)
        try {
            await voidEntry()
            onClose()
        } catch (error) {
            setVoidError(errorToString(error))
        }
    }

    const confirmDelete = async () => {
        setDeleteError(null)
        try {
            await deleteDraft({ stayPut: true })
            onClose()
        } catch (error) {
            setDeleteError(errorToString(error))
        }
    }

    return {
        confirmReverse,
        confirmVoid,
        confirmDelete,
        voidError,
        deleteError,
        clearErrors: () => {
            setVoidError(null)
            setDeleteError(null)
        },
        isReversing,
        isVoiding,
        isDeleting: isPending,
    }
}
