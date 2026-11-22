// The deposit read view's actions (bank deposit spec §3.8): a writer on a posted deposit
// may Edit (`canEdit`: the correction form is offered), Void and View journal entry; a
// writer on a void deposit and every reader only View journal entry. A draft opens in the
// form, so it has no read action. View journal entry needs the entry the post wrote.

import type { BooksDeposits } from '../types'

export type DepositReadAction = 'edit' | 'void' | 'entry'

export function depositReadActions(
    status: BooksDeposits['status'],
    canWrite: boolean,
    hasEntry: boolean,
    canEdit: boolean
): DepositReadAction[] {
    if (status === 'draft') return []
    const edit: DepositReadAction[] = canEdit ? ['edit'] : []
    const writes: DepositReadAction[] = status === 'posted' && canWrite ? [...edit, 'void'] : []
    return hasEntry ? [...writes, 'entry'] : writes
}
