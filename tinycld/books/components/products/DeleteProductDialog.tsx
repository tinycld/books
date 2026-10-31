import type { useProductActions } from '../../hooks/useProductActions'
import type { ProductRecord } from '../../hooks/useProductsQuery'
import { productDeleteLines } from '../../lib/product-display'
import { type DeleteDialogConfirm, DeleteRecordDialog } from '../DeleteRecordDialog'

const DELETE_CONFIRM: DeleteDialogConfirm = {
    testID: 'delete-product-confirm',
    label: 'Delete',
    isDestructive: true,
}

interface DeleteProductDialogProps {
    product: ProductRecord | null
    actions: ReturnType<typeof useProductActions>
    // The product is open beside the list with unsaved edits, which the delete drops.
    isOpenAndDirty: boolean
    // This product's refusal, or null; another product's stays in the list's banner.
    refusal: string | null
    onClose: () => void
    // Takes the user off the product once the delete lands, if they still see it, and
    // says whether it did.
    onDeleted: () => boolean
}

// The mutation state belongs to the list, which owns the one actions instance.
export function DeleteProductDialog({
    product,
    actions,
    isOpenAndDirty,
    refusal,
    onClose,
    onDeleted,
}: DeleteProductDialogProps) {
    if (!product) return null
    const lines = productDeleteLines({
        name: product.name,
        isBundle: product.type === 'bundle',
        isOpenAndDirty,
        refusal,
    })
    const confirm = () => actions.deleteRecord(product.id, onDeleted)

    return (
        <DeleteRecordDialog
            testIdPrefix="delete-product"
            title="Delete product or service"
            lines={lines}
            confirm={DELETE_CONFIRM}
            closeLabel="Cancel"
            isWorking={actions.isWorking}
            onClose={onClose}
            onConfirm={confirm}
        />
    )
}
