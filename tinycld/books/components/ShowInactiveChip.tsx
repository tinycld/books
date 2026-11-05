import { Pressable, Text } from 'react-native'

interface ShowInactiveChipProps {
    testID: string
    isOn: boolean
    onToggle(): void
    minHeight?: number
}

export function ShowInactiveChip({ testID, isOn, onToggle, minHeight }: ShowInactiveChipProps) {
    const box = isOn ? 'border-primary bg-primary' : 'border-border bg-background'
    const text = isOn ? 'text-primary-foreground' : 'text-foreground'
    return (
        <Pressable
            testID={testID}
            accessibilityRole="switch"
            accessibilityState={{ checked: isOn }}
            // react-native-web does not emit aria-checked from accessibilityState.
            aria-checked={isOn}
            onPress={onToggle}
            className={`justify-center rounded-full border px-3 ${box}`}
            style={{ minHeight: minHeight ?? 40 }}
        >
            <Text className={`text-sm ${text}`}>Show inactive</Text>
        </Pressable>
    )
}
