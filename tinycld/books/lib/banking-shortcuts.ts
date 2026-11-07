import type { Shortcut } from '@tinycld/core/lib/shortcuts'

// The keys of the Banking page (N Connect account, U Choose file, I Import transactions)
// and of its dialogs (⌘↵ submits). Pure, so the key map and when each key may fire are
// unit-tested.

export type BankingKeyAction = 'connect' | 'chooseFile' | 'importFile'

export const BANKING_KEYS: Record<BankingKeyAction, string> = {
    connect: 'n',
    chooseFile: 'u',
    importFile: 'i',
}

const BANKING_DESCRIPTIONS: Record<BankingKeyAction, string> = {
    connect: 'Connect account',
    chooseFile: 'Choose file',
    importFile: 'Import transactions',
}

const BANKING_ACTIONS = Object.keys(BANKING_KEYS) as BankingKeyAction[]

const GROUP = 'Banking'

export interface BankingKeyState {
    // The panel's More menu is open (a menu pushes no scope, so its focused row would
    // otherwise pass the letter on to the page).
    isMenuOpen: boolean
    // An upload of the selected connection runs.
    isBusy: boolean
}

export function bankingKeyAvailable(action: BankingKeyAction, state: BankingKeyState): boolean {
    if (state.isMenuOpen) return false
    if (action === 'chooseFile') return !state.isBusy
    return true
}

// Connect account is offered with Books write access while the server takes writes, on
// the introduction or the page; Choose file also needs the page and a selected connection
// whose panel has loaded (the Choose file button shows only then); Import transactions
// needs what Choose file needs and a file of that connection waiting to import.
export function offeredBankingKeys(input: {
    canWrite: boolean
    isWriteBlocked: boolean
    state: 'loading' | 'error' | 'intro' | 'ready'
    hasSelection: boolean
    isPanelLoading: boolean
    hasWaitingFile: boolean
}): BankingKeyAction[] {
    if (!input.canWrite || input.isWriteBlocked) return []
    if (input.state === 'intro') return ['connect']
    if (input.state !== 'ready') return []
    if (!input.hasSelection || input.isPanelLoading) return ['connect']
    return input.hasWaitingFile
        ? ['connect', 'chooseFile', 'importFile']
        : ['connect', 'chooseFile']
}

// Single letters, so they never fire while a text field has focus (no allowInInputs).
// A key is built only for an offered action, because core's shortcut list shows every
// registered key of the active scope and does not read `when`. `when` still reads the
// state at press time.
export function bankingShortcuts(input: {
    id: string
    offered: readonly BankingKeyAction[]
    read: () => BankingKeyState
    run: Record<BankingKeyAction, () => void>
}): Shortcut[] {
    const { id, offered, read, run } = input
    return BANKING_ACTIONS.filter(action => offered.includes(action)).map(action => ({
        id: `${id}.${action}`,
        keys: BANKING_KEYS[action],
        scope: 'list',
        description: BANKING_DESCRIPTIONS[action],
        group: GROUP,
        when: () => bankingKeyAvailable(action, read()),
        run: () => run[action](),
    }))
}

// ⌘↵ in a dialog, also from a text field. `isEnabled` is read at press time, so the key
// does nothing while the dialog's own submit button would not take a press.
export function dialogSubmitShortcut(input: {
    id: string
    description: string
    isEnabled: () => boolean
    run: () => void
}): Shortcut {
    return {
        id: `${input.id}.submit`,
        keys: '$mod+Enter',
        scope: 'modal',
        description: input.description,
        group: GROUP,
        allowInInputs: true,
        when: () => input.isEnabled(),
        run: () => input.run(),
    }
}
