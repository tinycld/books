import type { Transaction } from '@tanstack/react-db'
import { captureException, errorToString } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useConnectivityStore } from '@tinycld/core/lib/stores/connectivity-store'
import { writesAvailability } from '@tinycld/core/lib/writes-available'
import { useRef } from 'react'
import { messageOnlyRefusal } from '../lib/refusal'
import type { RecordFormStore } from '../stores/record-form-store'

type InactiveVariables = { id: string; inactive: boolean }

// `onDeleted` takes the user off the deleted record and says whether it did.
type DeleteVariables = { id: string; onDeleted?: () => boolean }

// A refusal stays with the record it is about: that record's delete dialog shows it, and
// the list's banner shows it while no such dialog is open.
export type RecordRefusal = { id: string; message: string }

export type RecordActionsConfig<R extends { id: string }> = {
    setInactive(id: string, inactive: boolean): Transaction<Record<string, unknown>>
    remove(id: string): Transaction<Record<string, unknown>>
    get(id: string): R | undefined
    store: RecordFormStore<R>
    logContext: string
}

function statusOf(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
    return typeof error.status === 'number' ? error.status : undefined
}

// A write that got no answer from the server (status 0): one fixed message in place of the
// browser's raw fetch error. It does not read the live connectivity state, so it stays
// the same on every render while it shows.
export const SERVER_UNREACHED = "Your change wasn't saved: the server could not be reached."

function refusalOf(error: unknown, id: string | undefined): RecordRefusal | null {
    if (!error || id === undefined) return null
    if (statusOf(error) === 0) return { id, message: SERVER_UNREACHED }
    return { id, message: messageOnlyRefusal(error) ?? errorToString(error) }
}

// A refusal shows from the mutation's state (`actionError`), in the banner or the dialog,
// so the default toast must not show it a second time. A server failure, a request lost
// while the app thought it was online, or a client error with no status is still a bug
// to report.
function reportUnexpected(logContext: string, error: unknown) {
    const status = statusOf(error)
    const isClientError = status === undefined
    const isServerFailure = status !== undefined && status >= 500
    const isLostRequest =
        status === 0 && writesAvailability(useConnectivityStore.getState()).available
    if (isClientError || isServerFailure || isLostRequest) {
        captureException(logContext, error)
    }
}

/**
 * Make inactive, Make active and Delete from a record list. One instance, owned by the
 * list, so its banner and the delete dialog read the same refusal. One write runs at a
 * time: `isWorking` disables the other writes while one is in flight. Each call
 * resolves to whether the write is done; a refusal is in `actionError`.
 */
export function useRecordActions<R extends { id: string }>(config: RecordActionsConfig<R>) {
    const { store, logContext } = config
    // A ref, because two presses in one tick both see the same not-yet-pending state.
    const inFlight = useRef(false)

    const update = useMutation({
        mutationFn: function* ({ id, inactive }: InactiveVariables) {
            yield config.setInactive(id, inactive)
        },
        // Fails at once offline instead of pausing: the row menu's Make inactive and Make
        // active are not gated by core's offline check, and a paused write would leave
        // every row's write items disabled with no reason shown.
        networkMode: 'always',
        onError: error => reportUnexpected(logContext, error),
    })

    const remove = useMutation({
        mutationFn: function* ({ id }: DeleteVariables) {
            yield config.remove(id)
        },
        // The dialog's Delete is gated offline (core), so this only covers a connection
        // lost between the press and the request: it fails instead of pausing.
        networkMode: 'always',
        // When the user is taken off the deleted record, its screen clears the flag as
        // it unmounts; clearing it first would show the not-found message for a frame.
        onSuccess: (_data, { onDeleted }) => {
            if (onDeleted?.()) return
            store.getState().endDeleting()
        },
        // The rollback has restored the row by now, so the form takes it back.
        onError: error => {
            store.getState().endDeleting()
            reportUnexpected(logContext, error)
        },
    })

    const actionError =
        refusalOf(update.error, update.variables?.id) ??
        refusalOf(remove.error, remove.variables?.id)

    // Drops the refusal about `id`, or any refusal when no id is given. A mutation that
    // holds an error is not running, so the reset never drops a write in flight.
    const clearActionError = (id?: string) => {
        if (actionError === null) return
        if (id !== undefined && actionError.id !== id) return
        update.reset()
        remove.reset()
    }

    const runOne = async (write: () => Promise<unknown>) => {
        if (inFlight.current) return false
        inFlight.current = true
        // A new write replaces the last refusal.
        update.reset()
        remove.reset()
        try {
            await write()
            return true
        } catch {
            // The mutation's error is the refusal (`actionError`).
            return false
        } finally {
            inFlight.current = false
        }
    }

    const setInactive = (id: string, inactive: boolean) =>
        runOne(() => update.mutateAsync({ id, inactive }))

    // Reads the row at confirm, so the open record's screen holds the row as it is now.
    // A row already gone (deleted elsewhere) needs no delete.
    const deleteRecord = (id: string, onDeleted?: () => boolean) =>
        runOne(async () => {
            const live = config.get(id)
            if (!live) return
            // Before the mutation: its optimistic removal re-renders the open record's
            // screen at once, and that render must already see the flag.
            store.getState().startDeleting(live)
            await remove.mutateAsync({ id, onDeleted })
        })

    return {
        setInactive,
        deleteRecord,
        isWorking: update.isPending || remove.isPending,
        actionError,
        clearActionError,
    }
}
