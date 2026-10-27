import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { usePopoverContext } from '@tinycld/core/ui/popover'
import { EllipsisVertical } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable } from 'react-native'
import type { CustomerRecord } from '../../hooks/useCustomersQuery'
import type { CustomerMenuItem } from '../../lib/customer-actions'
import type { CustomerListRow } from '../../lib/customer-tree'

interface CustomerRowMenuProps {
    row: CustomerListRow<CustomerRecord>
    items: CustomerMenuItem[]
    onSelect: (item: CustomerMenuItem) => void
    // A write from the list is in flight; the items that start another write wait.
    isWriting: boolean
}

const LABELS: Record<CustomerMenuItem, string> = {
    edit: 'Edit',
    'add-sub': 'Add sub-customer',
    'make-inactive': 'Make inactive',
    'make-active': 'Make active',
    delete: 'Delete',
}

// Make inactive and Make active are one slot in the menu, so they share a test id.
const TEST_IDS: Record<CustomerMenuItem, string> = {
    edit: 'customer-menu-edit',
    'add-sub': 'customer-menu-add-sub',
    'make-inactive': 'customer-menu-toggle-inactive',
    'make-active': 'customer-menu-toggle-inactive',
    delete: 'customer-menu-delete',
}

const WRITES: ReadonlySet<CustomerMenuItem> = new Set(['make-inactive', 'make-active', 'delete'])

// On a phone the menu is a sheet that slides out for a moment after it closes. Its items
// leave at once, so a closed menu's actions are never in the accessibility tree or the
// page next to the items of the next row's menu.
function WhileOpen({ children }: { children: ReactNode }) {
    const { isOpen } = usePopoverContext()
    if (!isOpen) return null
    return <>{children}</>
}

// A sibling of the row's or card's open button, never inside it, so a press on the menu
// or one of its items has no pressable ancestor to open the customer.
export function CustomerRowMenu({ row, items, onSelect, isWriting }: CustomerRowMenuProps) {
    const color = useThemeColor('muted-foreground')
    const { customer } = row
    const menuItems = items.map(item => (
        <Menu.Item
            key={item}
            testID={TEST_IDS[item]}
            label={LABELS[item]}
            isDestructive={item === 'delete'}
            isDisabled={isWriting && WRITES.has(item)}
            onSelect={() => onSelect(item)}
        />
    ))
    return (
        <Menu
            title={customer.display_name}
            placement="bottom-end"
            sheetSide="bottom"
            trigger={
                <Pressable
                    testID={`customer-menu-${customer.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Customer actions"
                    className="items-center justify-center"
                    style={{ width: 44, minHeight: 44 }}
                >
                    <EllipsisVertical size={18} color={color} />
                </Pressable>
            }
        >
            <WhileOpen>{menuItems}</WhileOpen>
        </Menu>
    )
}
