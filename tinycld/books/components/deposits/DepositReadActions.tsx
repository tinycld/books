import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { type DepositReadRecord, useDepositReadActions } from '../../hooks/useDepositReadActions'
import { DocumentReadActions } from '../documents/DocumentReadActions'
import { VoidDialog } from '../entries/VoidDialog'

interface DepositReadActionsProps {
    deposit: DepositReadRecord
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * The deposit read view's bar (bank deposit spec §3.2, §3.8), drawn by the shared
 * DocumentReadActions from the deposit's chrome (`deposit-read-void`, `deposit-read-entry`,
 * `deposit-read-more`; ⇧? group "Bank deposit"): wide, a ShortcutButton per action with
 * the screen's scope owner; phone, the actions in More with their keys. A hidden action's
 * key is not registered, and the open Void dialog's own scope holds the keys.
 */
export function DepositReadActions({ deposit, canWrite, scopeOwner }: DepositReadActionsProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const { items, voidDialog } = useDepositReadActions(deposit, canWrite)
    return (
        <>
            <DocumentReadActions
                actions={items}
                isPhone={isPhone}
                historyItem={null}
                isBusy={voidDialog.isPending}
                scopeOwner={scopeOwner}
            />
            <VoidDialog {...voidDialog} />
        </>
    )
}
