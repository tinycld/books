import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

interface AccountCaretProps {
    id: string
    hasChildren: boolean
    isCollapsed: boolean
    onToggle: (id: string) => void
}

export function AccountCaret({ id, hasChildren, isCollapsed, onToggle }: AccountCaretProps) {
    const color = useThemeColor('muted-foreground')
    if (!hasChildren) return <View style={{ width: 28 }} />
    const Icon = isCollapsed ? ChevronRight : ChevronDown
    return (
        <Pressable
            testID={`account-caret-${id}`}
            accessibilityRole="button"
            accessibilityLabel={isCollapsed ? 'Expand' : 'Collapse'}
            onPress={event => {
                // The caret sits inside the pressable row; it must not also open the account.
                event.stopPropagation()
                onToggle(id)
            }}
            style={{ width: 28, minHeight: 44 }}
            className="items-center justify-center"
        >
            <Icon size={16} color={color} />
        </Pressable>
    )
}
