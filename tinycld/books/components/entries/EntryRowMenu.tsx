import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { EllipsisVertical } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { type GestureResponderEvent, Pressable } from 'react-native'
import type { EntryActionId } from '../../lib/entry-actions'
import { entryNumberText } from '../../lib/entry-display'
import type { EntryListItem } from './EntryRow'

interface EntryRowMenuProps {
    entry: EntryListItem
    actions: EntryActionId[]
    onAction(action: EntryActionId): void
}

const LABELS: Record<EntryActionId, string> = {
    open: 'Open',
    edit: 'Edit',
    reverse: 'Reverse',
    void: 'Void',
    delete: 'Delete',
}

export function EntryRowMenu({ entry, actions, onAction }: EntryRowMenuProps) {
    const color = useThemeColor('muted-foreground')
    const items = actions.map(action => (
        <Menu.Item
            key={action}
            testID={`entries-menu-${action}`}
            label={LABELS[action]}
            isDestructive={action === 'void' || action === 'delete'}
            onSelect={() => onAction(action)}
        />
    ))
    return (
        <PressBoundary>
            <Menu
                title={entryNumberText(entry)}
                placement="bottom-end"
                sheetSide="bottom"
                trigger={
                    <Pressable
                        testID={`entries-row-menu-${entry.id}`}
                        accessibilityRole="button"
                        accessibilityLabel="Entry actions"
                        // The trigger sits inside the pressable row; it must not also open the entry.
                        onPress={swallow}
                        className="items-center justify-center"
                        style={{ width: 44, minHeight: 44 }}
                    >
                        <EllipsisVertical size={18} color={color} />
                    </Pressable>
                }
            >
                {items}
            </Menu>
        </PressBoundary>
    )
}

// The menu's content is portaled, but React still bubbles its presses to the row's
// Pressable, which would open the entry behind the action just chosen.
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
