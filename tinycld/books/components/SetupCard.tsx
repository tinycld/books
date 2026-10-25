import { Pressable, Text } from 'react-native'
import { useSetupCard } from '../hooks/useSetupCard'

export function SetupCard({ isVisible }: { isVisible: boolean }) {
    const { open } = useSetupCard()
    if (!isVisible) return null
    return (
        <Pressable
            testID="books-setup-card"
            accessibilityRole="button"
            onPress={open}
            className="gap-1 rounded-xl border border-primary bg-surface-secondary p-4"
            style={{ minHeight: 44 }}
        >
            <Text className="text-base font-semibold text-foreground">Finish setting up Books</Text>
            <Text className="text-xs text-muted-foreground">
                Name your business and create your starter chart of accounts.
            </Text>
        </Pressable>
    )
}
