import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { usePopoverContext } from '@tinycld/core/ui/popover'
import { EllipsisVertical } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable } from 'react-native'
import { RECORD_MENU_WRITES } from '../lib/record-menu'

interface RecordRowMenuProps<I extends string> {
    title: string
    triggerTestId: string
    triggerLabel: string
    items: readonly I[]
    labels: Record<I, string>
    testIds: Record<I, string>
    onSelect: (item: I) => void
    // A write from the list is in flight; the items that start another write wait.
    isWriting: boolean
}

// On a phone the menu is a sheet that slides out for a moment after it closes. Its items
// leave at once, so a closed menu's actions are never in the accessibility tree or the
// page next to the items of the next row's menu.
function WhileOpen({ children }: { children: ReactNode }) {
    const { isOpen } = usePopoverContext()
    if (!isOpen) return null
    return <>{children}</>
}

// A sibling of the row's or card's open button, never inside it, so a press on the menu
// or one of its items has no pressable ancestor to open the record.
export function RecordRowMenu<I extends string>({
    title,
    triggerTestId,
    triggerLabel,
    items,
    labels,
    testIds,
    onSelect,
    isWriting,
}: RecordRowMenuProps<I>) {
    const color = useThemeColor('muted-foreground')
    const menuItems = items.map(item => (
        <Menu.Item
            key={item}
            testID={testIds[item]}
            label={labels[item]}
            isDestructive={item === 'delete'}
            isDisabled={isWriting && RECORD_MENU_WRITES.has(item)}
            onSelect={() => onSelect(item)}
        />
    ))
    return (
        <Menu
            title={title}
            placement="bottom-end"
            sheetSide="bottom"
            trigger={
                <Pressable
                    testID={triggerTestId}
                    accessibilityRole="button"
                    accessibilityLabel={triggerLabel}
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
