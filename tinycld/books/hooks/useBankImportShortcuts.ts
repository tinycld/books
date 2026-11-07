import { useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import {
    BANK_IMPORT_KEYS,
    type BankImportKeyAction,
    type BankImportKeyStep,
    bankImportShortcuts,
    offeredBankImportKeys,
} from '../lib/bank-import-shortcuts'

function isBankImportKeyAction(name: string): name is BankImportKeyAction {
    return Object.hasOwn(BANK_IMPORT_KEYS, name)
}

// The import page's keys, each only while its action is offered (⌘↵ Import not while the
// server cannot take writes, as its button is disabled then). The page owns a `list`
// scope; the ⇧? list and every core dialog push a `modal` scope above it, so no page key
// fires then, and an open select menu takes Esc first (core layer stack). Handlers are
// read at press time through a ref; the keys re-register only when what is offered, the
// step or the format changes (the descriptions follow them), never on an ordinary render.
export function useBankImportShortcuts(input: {
    step: BankImportKeyStep
    isCsv: boolean
    isBusy: boolean
    hasRows: boolean
    run: Record<BankImportKeyAction, () => void>
}): void {
    const { step, isCsv, isBusy, hasRows, run } = input
    const owner = useShortcutScope('list')
    const instance = useId()
    const isWriteBlocked = useServerActionState().isDisabled
    const runRef = useRef(run)
    runRef.current = run
    const offeredNames = offeredBankImportKeys({
        step,
        isCsv,
        isBusy,
        hasRows,
        isWriteBlocked,
    }).join(',')
    const shortcuts = useMemo(
        () =>
            bankImportShortcuts({
                id: `books.bankImport.page.${instance}`,
                offered: offeredNames.split(',').filter(isBankImportKeyAction),
                step,
                isCsv,
                run: {
                    submit: () => runRef.current.submit(),
                    back: () => runRef.current.back(),
                    toggleAll: () => runRef.current.toggleAll(),
                },
            }),
        [instance, offeredNames, step, isCsv]
    )
    useRegisterShortcuts(shortcuts, owner)
}
