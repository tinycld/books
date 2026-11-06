import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Menu } from '@tinycld/core/ui/menu'
import { usePopoverContext } from '@tinycld/core/ui/popover'
import { EllipsisVertical } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable } from 'react-native'

// On a phone the menu is a sheet that slides out for a moment after it closes. Its items
// leave at once, so a closed menu's actions are never in the page.
function WhileOpen({ children }: { children: ReactNode }) {
    const { isOpen } = usePopoverContext()
    if (!isOpen) return null
    return <>{children}</>
}

interface BankPanelMenuProps {
    title: string
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onEditDetails: () => void
    onViewRegister: () => void
    onDisconnect: () => void
}

// The open state is in the banking store, so the page's keys can tell the menu is open.
export function BankPanelMenu({
    title,
    isOpen,
    onOpenChange,
    onEditDetails,
    onViewRegister,
    onDisconnect,
}: BankPanelMenuProps) {
    const color = useThemeColor('muted-foreground')
    // The dialog's Disconnect disables itself too; the item says so before it opens.
    const writes = useServerActionState()
    return (
        <Menu
            title={title}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            placement="bottom-end"
            sheetSide="bottom"
            trigger={
                <Pressable
                    testID="bank-panel-more"
                    accessibilityRole="button"
                    accessibilityLabel="More actions"
                    className="items-center justify-center"
                    style={{ width: 44, minHeight: 44 }}
                >
                    <EllipsisVertical size={18} color={color} />
                </Pressable>
            }
        >
            <WhileOpen>
                <Menu.Item
                    testID="bank-menu-edit"
                    label="Edit bank details"
                    onSelect={onEditDetails}
                />
                <Menu.Item
                    testID="bank-menu-register"
                    label="View register"
                    onSelect={onViewRegister}
                />
                <Menu.Item
                    testID="bank-menu-disconnect"
                    label="Disconnect"
                    isDestructive
                    isDisabled={writes.isDisabled}
                    onSelect={onDisconnect}
                />
            </WhileOpen>
        </Menu>
    )
}
