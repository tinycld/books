import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import type { AdjustmentReadActionsState } from '../../hooks/useAdjustmentReadActions'
import { DocumentInlineNotice } from '../documents/DocumentInlineNotice'
import { DocumentReadActions } from '../documents/DocumentReadActions'
import { AdjustmentVoidDialog } from './AdjustmentDialogs'

interface AdjustmentReadActionsProps {
    // The read view's useAdjustmentReadActions.
    actions: AdjustmentReadActionsState
    scopeOwner: ScopeOwner
}

/**
 * The inventory adjustment read view's bar (spec §3.4, §3.5), drawn by the shared
 * DocumentReadActions from the adjustment's chrome (`inventory-adjustment-read-edit`,
 * `-read-void`, `-read-copy`, `-read-more`; ⇧? group "Inventory adjustment"): wide, a
 * ShortcutButton per action with the screen's scope owner; phone, Edit and the rest in More
 * with their keys. An adjustment with no action draws no bar and registers no key. The
 * Void confirm's own scope holds the keys while it is open.
 */
export function AdjustmentReadActions({ actions, scopeOwner }: AdjustmentReadActionsProps) {
    const isPhone = useBreakpoint() === 'mobile'
    return (
        <>
            <DocumentReadActions
                actions={actions.items}
                isPhone={isPhone}
                historyItem={null}
                isBusy={actions.isBusy}
                scopeOwner={scopeOwner}
            />
            <AdjustmentVoidDialog state={actions.voidDialog} />
        </>
    )
}

/**
 * The server's refusal of the last Void (a closed period, a re-cost in a closed period),
 * in the read view under its header (spec §3.4 "the refusal shows in the read view's
 * notice"); nothing while none shows.
 */
export function AdjustmentRefusalNotice({ message }: { message: string | null }) {
    if (message === null) return null
    return <DocumentInlineNotice testID="inventory-adjustment-read-refusal" message={message} />
}
