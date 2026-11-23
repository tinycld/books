import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import type { LucideIcon } from 'lucide-react-native'
import type { Ref } from 'react'
import { Pressable, type PressableInstance } from 'react-native'

interface DashboardIconButtonProps {
    testID: string
    // The accessible name: the button shows only its icon.
    label: string
    icon: LucideIcon
    iconSize: number
    isDisabled: boolean
    accessibilityHint?: string
    onPress: () => void
    // Lets the owner put the focus back on the button (the edit list's Move buttons).
    buttonRef?: Ref<PressableInstance>
}

// The dashboard's 44 px bordered icon button: the phone Customize button and the edit
// list's Move up and Move down.
export function DashboardIconButton({
    testID,
    label,
    icon: Icon,
    iconSize,
    isDisabled,
    accessibilityHint,
    onPress,
    buttonRef,
}: DashboardIconButtonProps) {
    const color = useThemeColor('foreground')
    const style = { width: 44, height: 44, opacity: isDisabled ? 0.4 : 1 }
    return (
        <Pressable
            ref={buttonRef}
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint}
            disabled={isDisabled}
            onPress={onPress}
            className="items-center justify-center rounded-md border border-border"
            style={style}
        >
            <Icon size={iconSize} color={color} />
        </Pressable>
    )
}
