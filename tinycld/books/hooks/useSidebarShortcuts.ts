import { eq } from '@tanstack/db'
import { useAuth } from '@tinycld/core/lib/auth'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useMyLiveQuery } from '@tinycld/core/lib/use-my-live-query'
import { newRecordId } from 'pbtsdb/core'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import { DEFAULT_SHORTCUTS, parseShortcuts, type Shortcut } from '../lib/sidebar-shortcuts'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_SHORTCUTS: Shortcut[] = []

// One writer at a time for the whole app: the second of two fast changes runs after the
// first has landed, so it updates the row the first one made instead of making a second.
const WRITE_SCOPE = { id: 'books-sidebar-shortcuts' }

// The optimistic value is rolled back by pbtsdb, so the sidebar returns to the saved list
// with no state of its own here.
function reportSaveError(error: Error) {
    log.warn('books.sidebar.shortcuts', 'the shortcut change was not saved', { error })
    useToastStore.getState().addToast({
        title: 'The shortcut change was not saved.',
        variant: 'error',
        duration: 5000,
    })
}

/**
 * The signed-in user's sidebar shortcuts. `shortcuts` is empty until the read is ready
 * (the sidebar must not draw the defaults and then swap them) and with no signed-in user,
 * the defaults when the user has no row, and the stored list when there is one, an empty
 * list included. `save` writes the whole list and `reset` deletes the row, which brings
 * the defaults back; both do nothing until the read is ready and has not failed. A failed
 * read returns `isError` and the `recovery` for recoverLiveQueries.
 */
export function useSidebarShortcuts() {
    const [shortcutsCollection] = useStore('books_sidebar_shortcuts')
    const userId = useAuth({ throwIfAnon: false }).user?.id ?? ''
    const {
        data: row,
        isReady: queryIsReady,
        isError,
        collection: query,
    } = useMyLiveQuery(
        (q, me) =>
            q
                .from({ row: shortcutsCollection })
                .where(({ row }) => eq(row.user, me.userId))
                .findOne(),
        { queryKey: ['books', 'sidebar-shortcuts'] }
    )

    // With no user, useMyLiveQuery disables the query and a disabled query reports ready;
    // there is nothing to read, so the hook is not ready either.
    const isReady = queryIsReady && userId !== ''
    const items = row?.items
    const isCustomized = row !== undefined
    const shortcuts = useMemo(() => {
        if (!isReady || isError) return NO_SHORTCUTS
        return isCustomized ? parseShortcuts(items) : [...DEFAULT_SHORTCUTS]
    }, [isReady, isError, isCustomized, items])

    // Read when the write runs, not when it was asked for: a write waits for the one
    // before it (WRITE_SCOPE), and that one may have made the row.
    const storedRow = () => shortcutsCollection.toArray.find(stored => stored.user === userId)

    const saveMutation = useMutation({
        scope: WRITE_SCOPE,
        mutationFn: function* (next: Shortcut[]) {
            const stored = storedRow()
            if (stored) {
                yield shortcutsCollection.update(stored.id, draft => {
                    draft.items = next
                })
            } else {
                yield shortcutsCollection.insert({ id: newRecordId(), user: userId, items: next })
            }
        },
        onError: reportSaveError,
    })
    const resetMutation = useMutation({
        scope: WRITE_SCOPE,
        mutationFn: function* () {
            const stored = storedRow()
            if (stored) yield shortcutsCollection.delete(stored.id)
        },
        onError: reportSaveError,
    })

    const canWrite = isReady && !isError
    // `onSuccess` runs after the write is saved; a refused write shows the toast and does
    // not call it, so a caller that holds unsaved input (the Customize dialog) keeps it.
    const save = (next: Shortcut[], onSuccess?: () => void) => {
        if (canWrite) saveMutation.mutate(next, { onSuccess })
    }
    const reset = (onSuccess?: () => void) => {
        if (canWrite) resetMutation.mutate(undefined, { onSuccess })
    }
    const recovery: LiveRecovery =
        isError && query ? { queries: [query], sources: [shortcutsCollection] } : NO_RECOVERY

    return {
        shortcuts,
        isCustomized,
        isReady,
        isError,
        recovery,
        save,
        reset,
        isSaving: saveMutation.isPending || resetMutation.isPending,
    }
}
