import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { EllipsisVertical } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { type GestureResponderEvent, Pressable } from 'react-native'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { AccountMenuHandlers } from '../../hooks/useAccountsScreen'

interface AccountRowMenuProps {
    row: AccountRow
    menu: AccountMenuHandlers
    // A write in flight: the menu stays closed until it settles.
    isDisabled: boolean
}

export function AccountRowMenu({ row, menu, isDisabled }: AccountRowMenuProps) {
    const color = useThemeColor('muted-foreground')
    return (
        <PressBoundary>
            <Menu
                title={row.name}
                placement="bottom-end"
                trigger={
                    <Pressable
                        testID={`account-menu-${row.id}`}
                        accessibilityRole="button"
                        disabled={isDisabled}
                        accessibilityLabel={`Actions for ${row.name}`}
                        // The trigger sits inside the pressable row; it must not also open the account.
                        onPress={event => event.stopPropagation()}
                        className="items-center justify-center"
                        style={{ width: 44, minHeight: 44 }}
                    >
                        <EllipsisVertical size={18} color={color} />
                    </Pressable>
                }
            >
                <Menu.Item label="Edit" onSelect={() => menu.onEdit(row.id)} />
                <Menu.Item label="View register" onSelect={() => menu.onViewRegister(row.id)} />
                <Menu.Item label="Add sub-account" onSelect={() => menu.onAddSub(row.id)} />
                <Menu.Item
                    label={row.inactive ? 'Make active' : 'Make inactive'}
                    isDisabled={isDisabled}
                    onSelect={() => menu.onToggleInactive(row)}
                />
                <Menu.Item label="Delete" isDestructive onSelect={() => menu.onDelete(row.id)} />
            </Menu>
        </PressBoundary>
    )
}

// The menu's content is portaled, but React still bubbles its presses to the
// row's Pressable, which would open the Edit panel behind the action just chosen.
// A Pressable swallows the presses that reach it.
function PressBoundary({ children }: { children: ReactNode }) {
    return (
        <Pressable accessible={false} focusable={false} onPress={swallow}>
            {children}
        </Pressable>
    )
}

function swallow(event: GestureResponderEvent) {
    event.stopPropagation()
}
