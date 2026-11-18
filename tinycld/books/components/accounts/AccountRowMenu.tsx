import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { EllipsisVertical } from 'lucide-react-native'
import { Pressable } from 'react-native'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { AccountMenuHandlers } from '../../hooks/useAccountsScreen'
import { PressBoundary } from '../PressBoundary'

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
