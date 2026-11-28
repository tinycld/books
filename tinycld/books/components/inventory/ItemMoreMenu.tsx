import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import {
    formatHint,
    type Shortcut,
    useRegisterShortcuts,
    useScopeOwner,
} from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo } from 'react'
import type { ItemPageState } from '../../hooks/useItemPage'
import type { BooksProducts } from '../../types'
import { type DocumentMoreItem, DocumentMoreMenu } from '../documents/DocumentActionBar'
import { DeleteProductDialog } from '../products/DeleteProductDialog'

const MOVE_STOCK_KEYS = 'm'

/**
 * On a phone Move stock is a row of More, which has no ShortcutButton, so its key is
 * registered here, in the page's `modal` scope. `onMove` is stable (useItemPage), so the
 * key registers again only when the row comes or goes or writes turn on or off.
 */
function usePhoneMoveKey(isRegistered: boolean, isEnabled: boolean, onMove: () => void) {
    const scopeOwner = useScopeOwner() ?? undefined
    const instance = useId()
    const shortcuts = useMemo<Shortcut[]>(() => {
        if (!isRegistered) return []
        return [
            {
                id: `books.item.${instance}.move-stock`,
                keys: MOVE_STOCK_KEYS,
                scope: 'modal',
                description: 'Move stock',
                group: 'Item',
                when: () => isEnabled,
                run: onMove,
            },
        ]
    }, [isRegistered, isEnabled, onMove, instance])
    useRegisterShortcuts(shortcuts, scopeOwner)
}

interface ItemMoreMenuProps {
    record: BooksProducts
    page: ItemPageState
}

/**
 * The item page's More for a writer (inventory-adjust spec §3.6 "Header"): on a phone Move
 * stock first (while the book has a bin, with its key M), then Make inactive or Make
 * active, and Delete, through the list's actions (useProductActions) and its Delete dialog.
 * Each is disabled while a write runs or writes cannot reach the server. A refusal shows
 * in the page's banner (Delete's in its dialog). Row ids `item-<id>` (ItemPage's document
 * chrome).
 */
export function ItemMoreMenu({ record, page }: ItemMoreMenuProps) {
    const writes = useWritesAvailable()
    const isPhone = useBreakpoint() === 'mobile'
    const { actions, deleteDialog, moveStock } = page
    const isMoveRow = isPhone && moveStock.isOffered
    usePhoneMoveKey(isMoveRow, writes.available, moveStock.open)
    if (!page.canWrite) return null
    const isWriteDisabled = actions.isWorking || !writes.available
    const moveRow: DocumentMoreItem = {
        id: 'more-move-stock',
        label: 'Move stock',
        keys: formatHint(MOVE_STOCK_KEYS).text,
        isDisabled: !writes.available,
        onSelect: moveStock.open,
    }
    const rows: DocumentMoreItem[] = [
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
    const items = isMoveRow ? [moveRow, ...rows] : rows
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
