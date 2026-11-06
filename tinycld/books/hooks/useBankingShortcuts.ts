import { useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import {
    BANKING_KEYS,
    type BankingKeyAction,
    type BankingKeyState,
    bankingShortcuts,
    offeredBankingKeys,
} from '../lib/banking-shortcuts'
import type { BankFileUpload } from './useBankFileUpload'
import type { BankingScreenModel } from './useBankingScreen'

function isBankingKeyAction(name: string): name is BankingKeyAction {
    return Object.hasOwn(BANKING_KEYS, name)
}

// The page keys (N Connect account, U Choose file), each only while its action is
// offered. The page owns a `list` scope; every core dialog and sheet pushes a `modal`
// scope above it while open, and so does the ⇧? list, so no page key fires then. State
// and handlers are read at press time through refs; the keys re-register only when what
// is offered changes, never on an ordinary render. U calls `pick()` inside the key event,
// so the browser opens its file dialog from that user gesture.
export function useBankingShortcuts({
    model,
    upload,
}: {
    model: BankingScreenModel
    upload: BankFileUpload
}): void {
    const owner = useShortcutScope('list')
    const instance = useId()
    const writes = useServerActionState()
    const stateRef = useRef<BankingKeyState>({
        isMenuOpen: model.isPanelMenuOpen,
        isBusy: upload.isBusy,
    })
    stateRef.current = { isMenuOpen: model.isPanelMenuOpen, isBusy: upload.isBusy }
    const runRef = useRef({ connect: model.onConnect, chooseFile: upload.pick })
    runRef.current = { connect: model.onConnect, chooseFile: upload.pick }
    const offeredNames = offeredBankingKeys({
        canWrite: model.canWrite,
        isWriteBlocked: writes.isDisabled,
        state: model.state,
        hasSelection: model.selected !== undefined,
        isPanelLoading: model.isPanelLoading,
    }).join(',')
    const shortcuts = useMemo(
        () =>
            bankingShortcuts({
                id: `books.banking.page.${instance}`,
                offered: offeredNames.split(',').filter(isBankingKeyAction),
                read: () => stateRef.current,
                run: {
                    connect: () => runRef.current.connect(),
                    chooseFile: () => runRef.current.chooseFile(),
                },
            }),
        [instance, offeredNames]
    )
    useRegisterShortcuts(shortcuts, owner)
}
