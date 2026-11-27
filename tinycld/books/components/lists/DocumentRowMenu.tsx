import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { useIsFocused } from 'expo-router'
import { MoreVertical } from 'lucide-react-native'
import { Pressable } from 'react-native'
import type { DocumentRowActions } from '../../hooks/useDocumentRowActions'
import { type DocumentListRow, kindLabel } from '../../lib/document-list'
import { rowActionTestId } from '../../lib/document-row-menu'
import { type ListRowAction, listRowMenuItems, listRowMenuLabel } from '../../lib/list-row-menu'
import { useDocumentListStore } from '../../stores/document-list-store'
import { PressBoundary } from '../PressBoundary'

const TRIGGER_STYLE = { width: 44, minHeight: 44 }

function isDestructiveAction(action: ListRowAction): boolean {
    return action === 'void' || action === 'delete_draft' || action === 'delete'
}

interface MenuItemsProps {
    row: DocumentListRow
    testIdPrefix: string
    items: readonly ListRowAction[]
    actions: Pick<DocumentRowActions, 'run' | 'isDisabled'>
}

function MenuItems({ row, testIdPrefix, items, actions }: MenuItemsProps) {
    const rendered = items.map(action => {
        const select = () => actions.run(row, action)
        const label = listRowMenuLabel(row, action)
        return (
            <Menu.Item
                key={action}
                testID={rowActionTestId(testIdPrefix, action)}
                label={label}
                isDestructive={isDestructiveAction(action)}
                isDisabled={actions.isDisabled(action)}
                onSelect={select}
            />
        )
    })
    return <>{rendered}</>
}

// Open while the store's menu is this row's and the list has the focus: a list under a
// pushed document stays mounted, and its menu must not draw there.
function useRowMenuOpen(id: string) {
    const key = `row:${id}`
    const isFocused = useIsFocused()
    const isOpen = useDocumentListStore(state => state.menu === key)
    const setMenu = useDocumentListStore(state => state.setMenu)
    return {
        isOpen: isFocused && isOpen,
        setOpen: (next: boolean) => setMenu(next ? key : ''),
    }
}

interface DocumentRowMenuProps {
    row: DocumentListRow
    // The list area's test-id prefix (`<prefix>-row-menu-<id>`, `<prefix>-row-action-…`).
    testIdPrefix: string
    canWrite: boolean
    // A Books admin: a purchase order's menu adds Close.
    isAdmin: boolean
    actions: Pick<DocumentRowActions, 'run' | 'isDisabled'>
}

/**
 * The "More actions" menu that ends a list's row or card (spec §3 "Row menu"): Open,
 * then what the document's read view offers for its status and the user's access
 * (`listRowMenuItems`: the sales or the purchase rules by the row's kind). Its items exist
 * only while it is open, because core Sheet keeps its content in the page while it slides
 * out. A press on the button or an item never opens the row.
 */
export function DocumentRowMenu({
    row,
    testIdPrefix,
    canWrite,
    isAdmin,
    actions,
}: DocumentRowMenuProps) {
    const color = useThemeColor('muted-foreground')
    const { isOpen, setOpen } = useRowMenuOpen(row.id)
    const items = isOpen ? listRowMenuItems(row, canWrite, isAdmin) : []
    const title = `${kindLabel(row.kind)} ${row.number}`.trim()
    // An element, not a component: the menu clones it with its press handler and ref.
    const trigger = (
        <Pressable
            testID={`${testIdPrefix}-row-menu-${row.id}`}
            accessibilityRole="button"
            accessibilityLabel="More actions"
            className="items-center justify-center"
            style={TRIGGER_STYLE}
        >
            <MoreVertical size={18} color={color} />
        </Pressable>
    )
    return (
        <PressBoundary>
            <Menu
                title={title}
                placement="bottom-end"
                sheetSide="bottom"
                isOpen={isOpen}
                onOpenChange={setOpen}
                trigger={trigger}
            >
                <MenuItems row={row} testIdPrefix={testIdPrefix} items={items} actions={actions} />
            </Menu>
        </PressBoundary>
    )
}
