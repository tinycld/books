import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { writeRefusalText } from '../lib/refusal'
import { reportUnexpected } from './useRecordActions'

const TOAST_MS = 6000
export const STATEMENT_DELETE_FAILED = 'Could not delete the statement'

/**
 * Deletes one statement (statements spec §3.8, §4.5 Delete): a core `useMutation` that
 * yields `books_statements.delete(id)`. A refusal shows as an error toast with the server's
 * text; the rollback has restored the row by then. `remove` resolves to whether the delete
 * went through.
 */
export function useStatementDelete() {
    const [statementsCollection] = useStore('books_statements')
    const mutation = useMutation({
        mutationKey: ['books', 'statements', 'delete'],
        // The confirm's Delete is gated offline (core ConfirmDialog), so this only covers a
        // connection lost between the press and the request: it fails instead of pausing.
        networkMode: 'always',
        mutationFn: function* (id: string) {
            yield statementsCollection.delete(id)
        },
        onError: error => {
            reportUnexpected('books.statements.delete', error)
            useToastStore.getState().addToast({
                title: STATEMENT_DELETE_FAILED,
                body: writeRefusalText(error),
                variant: 'error',
                duration: TOAST_MS,
            })
        },
    })
    const remove = async (id: string): Promise<boolean> => {
        try {
            await mutation.mutateAsync(id)
            return true
        } catch {
            // The toast of onError shows the refusal.
            return false
        }
    }
    return { remove, isDeleting: mutation.isPending }
}
