import type {
    AdjustmentDeleteDialogState,
    AdjustmentVoidDialogState,
} from '../../hooks/useAdjustmentReadActions'
import { INVENTORY_TEXTS } from '../../lib/inventory-adjust-fixture'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'

/**
 * The Void confirm of an inventory adjustment (spec §3.4): "Void inventory adjustment
 * <number>? Its stock change is taken back." in the shared DeleteDraftDialog with the void
 * words (`adjustment-void-dialog`, `adjustment-void-confirm`), from the read view and the
 * list (useAdjustmentVoid).
 */
export function AdjustmentVoidDialog({ state }: { state: AdjustmentVoidDialogState }) {
    const { number, ...dialog } = state
    return (
        <DeleteDraftDialog
            {...dialog}
            title={INVENTORY_TEXTS.voidTitle}
            body={INVENTORY_TEXTS.voidBody(number)}
            actionLabel="Void"
            testIdPrefix="adjustment-void"
        />
    )
}

/**
 * The Delete draft confirm (spec §3.4): "Delete this draft inventory adjustment? This
 * can't be undone." (`delete-draft-dialog`, `delete-draft-confirm`), from the form and the
 * list (useAdjustmentDelete).
 */
export function AdjustmentDeleteDialog({ state }: { state: AdjustmentDeleteDialogState }) {
    return <DeleteDraftDialog {...state} body={INVENTORY_TEXTS.deleteDraft} />
}
