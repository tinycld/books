import { create } from '@tinycld/core/lib/store'
import type { BooksAccounts } from '../types'

type Box = BooksAccounts['form_1099_box']

// A refused write, with the box the account had when the write started.
export interface BoxRefusal {
    message: string
    fromBox: Box
}

interface AccountBoxState {
    // The box each account's write is saving, by account id.
    pending: Record<string, Box>
    // The last refusal of each account's write, by account id.
    refusals: Record<string, BoxRefusal>
    startWrite: (id: string, box: Box) => void
    endWrite: (id: string, refusal: BoxRefusal | null) => void
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
    const { [id]: _dropped, ...rest } = record
    return rest
}

// A box write updates the account optimistically, before the server answers. Clearing an
// inactive account's box drops the reason the card lists it, so the card keeps every id
// whose write is pending listed. A store updates synchronously, so the hold is visible to
// the very render the optimistic update triggers, and it outlives the row if the row
// remounts.
export const useAccountBoxStore = create<AccountBoxState>()(set => ({
    pending: {},
    refusals: {},
    // A new write replaces the account's last refusal.
    startWrite: (id, box) =>
        set(state => ({
            pending: { ...state.pending, [id]: box },
            refusals: without(state.refusals, id),
        })),
    endWrite: (id, refusal) =>
        set(state => ({
            pending: without(state.pending, id),
            refusals: refusal === null ? state.refusals : { ...state.refusals, [id]: refusal },
        })),
}))

// A refusal holds no row: a refused write's rollback restores the box in the same tick the
// write rejects, before onError releases the pending hold, so a refused clear stays listed
// by its restored box. A refusal that held its row would keep it listed after the chart or
// another device makes the row unlisted.
export function heldAccountIds(state: Pick<AccountBoxState, 'pending'>) {
    return new Set(Object.keys(state.pending))
}

// A refusal describes the row only while the account still has the box its write started
// from; once another device or the chart changes the box, the refusal no longer applies.
export function visibleRefusal(refusal: BoxRefusal | undefined, liveBox: Box) {
    if (refusal === undefined || refusal.fromBox !== liveBox) return null
    return refusal.message
}
