import type { useVendorActions } from '../../hooks/useVendorActions'
import type { VendorRecord } from '../../hooks/useVendorsQuery'
import { vendorDeleteLines } from '../../lib/vendor-display'
import { type DeleteDialogConfirm, DeleteRecordDialog } from '../DeleteRecordDialog'

const DELETE_CONFIRM: DeleteDialogConfirm = {
    testID: 'delete-vendor-confirm',
    label: 'Delete',
    isDestructive: true,
}

interface DeleteVendorDialogProps {
    vendor: VendorRecord | null
    actions: ReturnType<typeof useVendorActions>
    // The vendor is open beside the list with unsaved edits, which the delete drops.
    isOpenAndDirty: boolean
    // This vendor's refusal, or null; another vendor's stays in the list's banner.
    refusal: string | null
    onClose: () => void
    // Takes the user off the vendor once the delete lands, if they still see it, and
    // says whether it did.
    onDeleted: () => boolean
}

// The mutation state belongs to the list, which owns the one actions instance.
export function DeleteVendorDialog({
    vendor,
    actions,
    isOpenAndDirty,
    refusal,
    onClose,
    onDeleted,
}: DeleteVendorDialogProps) {
    if (!vendor) return null
    const lines = vendorDeleteLines({ name: vendor.display_name, isOpenAndDirty, refusal })
    const confirm = () => actions.deleteRecord(vendor.id, onDeleted)

    return (
        <DeleteRecordDialog
            testIdPrefix="delete-vendor"
            title="Delete vendor"
            lines={lines}
            confirm={DELETE_CONFIRM}
            closeLabel="Cancel"
            isWorking={actions.isWorking}
            onClose={onClose}
            onConfirm={confirm}
        />
    )
}
