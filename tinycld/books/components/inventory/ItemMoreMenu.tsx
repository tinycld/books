import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import type { ItemPageState } from '../../hooks/useItemPage'
import type { BooksProducts } from '../../types'
import { type DocumentMoreItem, DocumentMoreMenu } from '../documents/DocumentActionBar'
import { DeleteProductDialog } from '../products/DeleteProductDialog'

interface ItemMoreMenuProps {
    record: BooksProducts
    page: ItemPageState
}

/**
 * The item page's More for a writer (inventory-adjust spec §3.6 "Header"): Make inactive
 * or Make active, and Delete, through the list's actions (useProductActions) and its
 * Delete dialog. Each is disabled while a write runs or writes cannot reach the server.
 * A refusal shows in the page's banner (Delete's in its dialog). Row ids `item-<id>`
 * (ItemPage's document chrome).
 */
export function ItemMoreMenu({ record, page }: ItemMoreMenuProps) {
    const writes = useWritesAvailable()
    const { actions, deleteDialog } = page
    if (!page.canWrite) return null
    const isWriteDisabled = actions.isWorking || !writes.available
    const items: DocumentMoreItem[] = [
        {
            id: 'more-inactive',
            label: record.inactive ? 'Make active' : 'Make inactive',
            keys: '',
            isDisabled: isWriteDisabled,
            onSelect: page.toggleInactive,
        },
        {
            id: 'more-delete',
            label: 'Delete',
            keys: '',
            isDisabled: isWriteDisabled,
            isDestructive: true,
            onSelect: deleteDialog.open,
        },
    ]
    const deleteTarget = deleteDialog.isOpen ? record : null
    return (
        <>
            <DocumentMoreMenu items={items} isDisabled={false} testID="item-more" />
            <DeleteProductDialog
                product={deleteTarget}
                actions={actions}
                isOpenAndDirty={page.isDirty}
                refusal={deleteDialog.refusal}
                onClose={deleteDialog.close}
                onDeleted={deleteDialog.onDeleted}
            />
        </>
    )
}
