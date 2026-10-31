import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { box1099ValueSchema } from '../lib/box-1099-schema'
import type { Form1099AccountRow } from '../lib/form-1099-accounts'
import { errorStatus, messageOnlyRefusal, writeRefusalText } from '../lib/refusal'
import { useAccountBoxStore, visibleRefusal } from '../stores/account-box-store'
import type { BooksAccounts } from '../types'

type Box = BooksAccounts['form_1099_box']
// `fromBox` is the stored box when the write starts, which the refusal is shown against.
type BoxChange = { id: string; box: Box; fromBox: Box }

// A refusal and a write with no answer show under the row; the default handler would add
// a toast and a Sentry event for an expected one. A server failure or anything else is a
// bug.
function isUnexpected(error: unknown) {
    const status = errorStatus(error)
    if (status !== undefined && status >= 500) return true
    return messageOnlyRefusal(error) === null && status !== 0
}

// One account's box select: a choice saves at once, one write at a time. The write's
// state lives in the account box store, above the row, so the card keeps the row listed
// while the optimistic update says it should not be.
export function useAccountBoxMutation(row: Pick<Form1099AccountRow, 'id' | 'box'>) {
    const [accountsCollection] = useStore('books_accounts')
    const pendingBox = useAccountBoxStore(state => state.pending[row.id])
    const refusal = useAccountBoxStore(state => state.refusals[row.id])

    const mutation = useMutation({
        mutationFn: function* ({ id, box }: BoxChange) {
            yield accountsCollection.update(id, draft => {
                draft.form_1099_box = box
            })
        },
        // Fails at once offline instead of pausing, which would leave the select disabled
        // with no reason shown.
        networkMode: 'always',
        onSuccess: (_data, { id }) => useAccountBoxStore.getState().endWrite(id, null),
        onError: (error, { id, fromBox }) => {
            useAccountBoxStore.getState().endWrite(id, {
                message: writeRefusalText(error),
                fromBox,
            })
            if (isUnexpected(error)) log.error('books.form-1099', error)
        },
    })

    const isPending = pendingBox !== undefined
    // The live box feeds the row's form, so a refused write puts the stored box back.
    const shownBox = pendingBox ?? row.box

    const chooseBox = (value: string) => {
        const parsed = box1099ValueSchema.shape.box.safeParse(value)
        if (!parsed.success || parsed.data === shownBox) return
        const store = useAccountBoxStore.getState()
        // Read from the store, because two presses in one tick both see the same
        // not-yet-pending render.
        if (store.pending[row.id] !== undefined) return
        // Before the mutation: its optimistic update re-renders the card at once, and that
        // render must already see the hold.
        store.startWrite(row.id, parsed.data)
        mutation.mutate({ id: row.id, box: parsed.data, fromBox: row.box })
    }

    return { chooseBox, shownBox, isPending, error: visibleRefusal(refusal, row.box) }
}
