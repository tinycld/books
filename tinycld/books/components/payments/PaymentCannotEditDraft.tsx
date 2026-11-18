import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { usePaymentDraftDelete } from '../../hooks/usePaymentDraftDelete'
import type { PaymentWrites } from '../../hooks/usePaymentWrites'
import { FORM_KEYS } from '../../lib/entry-shortcuts'
import type { PaymentFlow } from '../../lib/payment-flow'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { PaymentStateNotice } from './PaymentStateNotice'

// The notice has no Cancel: nothing leaves the screen while its delete runs (the dialog
// is modal), so a delete that worked always goes back.
const HAS_NOT_LEFT = () => false

interface PaymentCannotEditDraftProps {
    flow: PaymentFlow
    // The flow's writes (a module-constant hook, called once per render).
    useWrites: () => PaymentWrites
    draftId: string
    // The draft's stored lines, which the delete removes before the header.
    lineIds: readonly string[]
    scopeOwner: ScopeOwner
    onRetry: () => void
}

/**
 * A stored correction draft whose original is no longer posted (vendor refund spec §3.8,
 * §3.6): the "cannot be edited" notice, with Delete draft (⌘⌫) so the draft can still be
 * removed. Delete draft opens the form's dialog and runs the form's delete
 * (usePaymentDraftDelete); a delete that worked goes back, as the form's does. The button
 * waits while the server cannot take writes and while the delete runs.
 */
export function PaymentCannotEditDraft({
    flow,
    useWrites,
    draftId,
    lineIds,
    scopeOwner,
    onRetry,
}: PaymentCannotEditDraftProps) {
    const writes = useWrites()
    const back = useBackToEntries()
    const draftDelete = usePaymentDraftDelete(flow, writes, {
        id: draftId,
        lineIds,
        hasLeft: HAS_NOT_LEFT,
        onDeleted: back.onBack,
    })
    const shortcut = {
        keys: FORM_KEYS.deleteDraft,
        scope: 'compose',
        allowInInputs: true,
        group: flow.chrome.shortcutGroup,
    } as const
    return (
        <>
            <PaymentStateNotice flow={flow} state="cannot-edit" onRetry={onRetry}>
                <ShortcutButton
                    label="Delete draft"
                    shortcut={shortcut}
                    onPress={draftDelete.openDeleteDraft}
                    serverAction
                    variant="outline"
                    isDisabled={draftDelete.isDeletePending}
                    testID={`${flow.testId}-cannot-edit-delete-draft`}
                    scopeOwner={scopeOwner}
                    className="self-center"
                />
            </PaymentStateNotice>
            <DeleteDraftDialog
                isVisible={draftDelete.isDeleteOpen}
                onConfirm={draftDelete.confirmDelete}
                onCancel={draftDelete.closeDeleteDraft}
                isPending={draftDelete.isDeletePending}
                errorMessage={draftDelete.deleteError}
                body={flow.texts.deleteDraftBody}
            />
        </>
    )
}
