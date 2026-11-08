import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { type ScopeOwner, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
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

// The page keys (N Connect account, U Choose file, I Import transactions from the newest
// file waiting to import), each only while its action is offered. The page owns a `list`
// scope; every core dialog and sheet pushes a `modal` scope above it while open, and so
// does the ⇧? list, so no page key fires then. State and handlers are read at press time
// through refs; the keys re-register only when what is offered changes, never on an
// ordinary render. U switches to the Files tab and calls `pick()` inside the key event, so
// the browser opens its file dialog from that user gesture. The tab keys 1–4 and the row
// keys belong to the transaction tabs (useReviewShortcuts), registered only while one shows.
export function useBankingShortcuts({
    model,
    upload,
    owner,
}: {
    model: BankingScreenModel
    upload: BankFileUpload
    // The page's one `list` scope, which the transaction tab keys share (ScopeProvider).
    owner: ScopeOwner
}): void {
    const instance = useId()
    const orgHref = useOrgHref()
    const writes = useServerActionState()
    const stateRef = useRef<BankingKeyState>({
        isMenuOpen: model.isPanelMenuOpen,
        isBusy: upload.isBusy,
    })
    stateRef.current = { isMenuOpen: model.isPanelMenuOpen, isBusy: upload.isBusy }
    // The files are newest first, so the first waiting one is the newest, read at press time.
    const newestWaiting = model.files.find(file => file.status === 'uploaded')
    const importFile = () => {
        if (!newestWaiting) return
        router.push(orgHref(`books/banking/import/${newestWaiting.id}`))
    }
    // The Files tab shows the upload's progress, so U switches to it first; `pick()` still
    // runs inside the same key event.
    const chooseFile = () => {
        if (model.tab !== 'files') model.onTab('files')
        upload.pick()
    }
    const runRef = useRef({ connect: model.onConnect, chooseFile, importFile })
    runRef.current = { connect: model.onConnect, chooseFile, importFile }
    const offeredNames = offeredBankingKeys({
        canWrite: model.canWrite,
        isWriteBlocked: writes.isDisabled,
        state: model.state,
        hasSelection: model.selected !== undefined,
        isPanelLoading: model.isPanelLoading,
        hasWaitingFile: newestWaiting !== undefined,
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
                    importFile: () => runRef.current.importFile(),
                },
            }),
        [instance, offeredNames]
    )
    useRegisterShortcuts(shortcuts, owner)
}
