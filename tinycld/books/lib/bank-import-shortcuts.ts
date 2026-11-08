import type { Shortcut } from '@tinycld/core/lib/shortcuts'

// The keys of the bank import page: ⌘↵ Continue (Map columns) or Import (Choose
// transactions), Esc goes back one (Back on a CSV file's Choose step, Cancel elsewhere),
// A chooses all ready rows or none. Pure, so the key map and when each key is offered are
// unit-tested.

export type BankImportKeyAction = 'submit' | 'back' | 'toggleAll'

export type BankImportKeyStep = 'map' | 'choose' | 'result' | 'message'

export const BANK_IMPORT_KEYS: Record<BankImportKeyAction, string> = {
    submit: '$mod+Enter',
    back: 'Escape',
    toggleAll: 'a',
}

const BANK_IMPORT_ACTIONS = Object.keys(BANK_IMPORT_KEYS) as BankImportKeyAction[]

const GROUP = 'Bank import'

// While an import runs no key is offered (Back, Cancel, the boxes and Import are disabled
// then). While the server cannot take writes, Import is not offered on Choose
// transactions (its button is disabled); Continue on Map columns writes nothing and stays.
// Choose transactions with nothing to choose, the result and the page's message states
// offer only Esc.
export function offeredBankImportKeys(input: {
    step: BankImportKeyStep
    isCsv: boolean
    isBusy: boolean
    hasRows: boolean
    isWriteBlocked: boolean
}): BankImportKeyAction[] {
    if (input.isBusy) return []
    if (input.step === 'map') return ['submit', 'back']
    if (input.step === 'choose' && input.hasRows) {
        if (input.isWriteBlocked) return ['back', 'toggleAll']
        return ['submit', 'back', 'toggleAll']
    }
    return ['back']
}

function description(action: BankImportKeyAction, step: BankImportKeyStep, isCsv: boolean): string {
    if (action === 'submit') return step === 'map' ? 'Continue' : 'Import'
    if (action === 'back') return step === 'choose' && isCsv ? 'Back' : 'Cancel'
    return 'Select all or none'
}

// A key is built only for an offered action, because core's shortcut list shows every
// registered key of the active scope. ⌘↵ also fires from a focused select trigger
// (allowInInputs); Esc and A do not, so a text field or an open select menu keeps them.
export function bankImportShortcuts(input: {
    id: string
    offered: readonly BankImportKeyAction[]
    step: BankImportKeyStep
    isCsv: boolean
    run: Record<BankImportKeyAction, () => void>
}): Shortcut[] {
    const { id, offered, step, isCsv, run } = input
    return BANK_IMPORT_ACTIONS.filter(action => offered.includes(action)).map(action => ({
        id: `${id}.${action}`,
        keys: BANK_IMPORT_KEYS[action],
        scope: 'list',
        description: description(action, step, isCsv),
        group: GROUP,
        allowInInputs: action === 'submit',
        run: () => run[action](),
    }))
}
