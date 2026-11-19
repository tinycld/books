import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useState } from 'react'
import { writeRefusalText } from '../lib/refusal'

/**
 * The void of a write-off (write-off spec §3.5): ONE update of `status` to `void`; the
 * server posts the reversing entry and opens the invoice again. The dialog's open state
 * lives on the page, which stays mounted while the optimistic void changes the write-off
 * under it, so a refusal (the close date) stays in the dialog with its text; a success
 * closes it.
 *
 * The update is optimistic, so the write-off reads `void` (and Void is no longer offered)
 * while the write runs. The dialog stays visible through its own void because the mutation
 * reports `isPending` before the optimistic write runs: React Query sets the mutation
 * pending before it calls the mutationFn, and this hook reads that state in each render.
 */
export function useVoidWriteOff() {
    const [writeOffsCollection] = useStore('books_write_offs')
    const [isOpen, setOpen] = useState(false)
    const mutation = useMutation({
        mutationFn: function* (id: string) {
            yield writeOffsCollection.update(id, draft => {
                draft.status = 'void'
            })
        },
        onSuccess: () => setOpen(false),
        // The dialog shows the refusal; without this core reports it again as a toast.
        onError: () => {},
    })
    const confirm = (id: string) => mutation.mutate(id)
    const open = () => {
        mutation.reset()
        setOpen(true)
    }
    const close = () => setOpen(false)
    return {
        isOpen,
        open,
        close,
        isPending: mutation.isPending,
        errorMessage: mutation.error ? writeRefusalText(mutation.error) : null,
        confirm,
    }
}
