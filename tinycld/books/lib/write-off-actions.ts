import { localDayOf } from './opening-balances'
import { formatDay } from './register-range'

// The write-off page's bar and states (write-off spec §3.5). A write-off is never edited,
// copied or deleted: Void is the one change it takes, and only a writer voids a posted one.

export type WriteOffAction = 'void' | 'invoice' | 'entry'

export const WRITE_OFF_ACTION_KEYS: Record<WriteOffAction, string> = {
    void: 'v',
    invoice: 'i',
    entry: 'j',
}

export const WRITE_OFF_ACTION_LABELS: Record<WriteOffAction, string> = {
    void: 'Void',
    invoice: 'Open invoice',
    entry: 'View journal entry',
}

/** Writer on posted: Void, Open invoice, View journal entry; else the two open actions. */
export function writeOffReadActions(status: string, canWrite: boolean): WriteOffAction[] {
    const voidAction: WriteOffAction[] = canWrite && status === 'posted' ? ['void'] : []
    return [...voidAction, 'invoice', 'entry']
}

export type WriteOffScreenState = 'loading' | 'error' | 'not-found' | 'read'

/**
 * What the page draws: a record it has stays drawn (a later failed read keeps it); with no
 * record, a failed read is the error, a running read is loading, and a finished read is
 * not found.
 */
export function writeOffScreenState(input: {
    isLoading: boolean
    isError: boolean
    hasRecord: boolean
}): WriteOffScreenState {
    if (input.hasRecord) return 'read'
    if (input.isError) return 'error'
    if (input.isLoading) return 'loading'
    return 'not-found'
}

/**
 * A stamp of the page (spec §3.5): "Posted by Dana Ortiz on Nov 18, 2026", the day in the
 * reader's time zone; "Posted on …" while the name is not known; empty with no stamp.
 */
export function writeOffStampOf(verb: string, userName: string | undefined, at: string): string {
    const day = localDayOf(at)
    if (day === '') return ''
    const by = userName ? ` by ${userName}` : ''
    return `${verb}${by} on ${formatDay(day)}`
}

/** Void is idle offline and while a void runs. */
export function writeOffVoidDisabled(input: {
    writesAvailable: boolean
    isPending: boolean
}): boolean {
    return !input.writesAvailable || input.isPending
}
