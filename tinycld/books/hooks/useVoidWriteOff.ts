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
 * The update is optimistic: the write-off reads `void` before the server answers, and
 * React Query reports `isPending` later, in a batched notification. So `confirm` sets
 * `isHeld` before the mutation starts, and it stays set until the mutation settles; the
 * page keeps the dialog open on it, so a render between the two cannot drop a refusal.
 */
export function useVoidWriteOff() {
    const [writeOffsCollection] = useStore('books_write_offs')
    const [isOpen, setOpen] = useState(false)
    const [isHeld, setHeld] = useState(false)
    const mutation = useMutation({
        mutationFn: function* (id: string) {
            yield writeOffsCollection.update(id, draft => {
                draft.status = 'void'
            })
        },
        onSuccess: () => setOpen(false),
        // The dialog shows the refusal; without this core reports it again as a toast.
        onError: () => {},
        onSettled: () => setHeld(false),
    })
    const confirm = (id: string) => {
        setHeld(true)
        mutation.mutate(id)
    }
    const open = () => {
        mutation.reset()
        setOpen(true)
    }
    const close = () => setOpen(false)
    return {
        isOpen,
        open,
        close,
        isHeld,
        isPending: isHeld || mutation.isPending,
        errorMessage: mutation.error ? writeRefusalText(mutation.error) : null,
        confirm,
    }
}
