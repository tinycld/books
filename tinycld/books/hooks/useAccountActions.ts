import { errorToString } from '@tinycld/core/lib/errors'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef, useState } from 'react'

type InactiveVariables = { id: string; inactive: boolean; done: number; total: number }

// A batch stops at the first refusal, so the count says how far it got.
export function refusalText(message: string, done: number, total: number) {
    return total > 1 ? `${done} of ${total} made inactive. ${message}` : message
}

export function useAccountActions() {
    const [accountsCollection] = useStore('books_accounts')
    const [actionError, setActionError] = useState<string | null>(null)
    const [isBusy, setIsBusy] = useState(false)
    // A ref, because two calls in one tick both see the same stale state.
    const inFlight = useRef(false)

    const update = useMutation({
        mutationFn: function* ({ id, inactive }: InactiveVariables) {
            yield accountsCollection.update(id, draft => {
                draft.inactive = inactive
            })
        },
        onError: (error: unknown, { done, total }: InactiveVariables) => {
            setActionError(refusalText(errorToString(error), done, total))
        },
    })

    const remove = useMutation({
        mutationFn: function* (id: string) {
            yield accountsCollection.delete(id)
        },
        onError: (error: unknown) => setActionError(errorToString(error)),
    })

    // `done` lists the ids changed, in order; `failed` is the id the server
    // refused. Ids after it were never tried. The refusal is already in actionError.
    const setInactive = async (
        ids: string[],
        inactive: boolean
    ): Promise<{ done: string[]; failed?: string }> => {
        if (inFlight.current) return { done: [] }
        inFlight.current = true
        setIsBusy(true)
        setActionError(null)
        const done: string[] = []
        try {
            for (const id of ids) {
                try {
                    await update.mutateAsync({ id, inactive, done: done.length, total: ids.length })
                } catch {
                    return { done, failed: id }
                }
                done.push(id)
            }
            return { done }
        } finally {
            inFlight.current = false
            setIsBusy(false)
        }
    }

    const deleteAccount = async (id: string) => {
        if (inFlight.current) return false
        inFlight.current = true
        setIsBusy(true)
        setActionError(null)
        try {
            await remove.mutateAsync(id)
            return true
        } catch {
            // onError has put the refusal in actionError.
            return false
        } finally {
            inFlight.current = false
            setIsBusy(false)
        }
    }

    return {
        setInactive,
        deleteAccount,
        isWorking: isBusy,
        actionError,
        clearActionError: () => setActionError(null),
    }
}
