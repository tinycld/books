import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface CardEmptyStateProps {
    isVisible: boolean
    title: string
    hint?: string
    action?: string
    testID: string
    actionTestID?: string
    onAction?: () => void
}

function EmptyHint({ hint }: { hint: string | undefined }) {
    if (!hint) return null
    return <Text className="text-center text-sm text-muted-foreground">{hint}</Text>
}

function EmptyAction({
    action,
    testID,
    onAction,
}: {
    action: string | undefined
    testID: string | undefined
    onAction: (() => void) | undefined
}) {
    if (!action) return null
    return (
        <Button
            variant="outline"
            size="sm"
            style={{ minHeight: 44 }}
            testID={testID}
            onPress={onAction}
        >
            <ButtonText>{action}</ButtonText>
        </Button>
    )
}

// A card's empty state. The action is a core Button: core EmptyState's text action is too
// faint in light mode.
export function CardEmptyState({
    isVisible,
    title,
    hint,
    action,
    testID,
    actionTestID,
    onAction,
}: CardEmptyStateProps) {
    if (!isVisible) return null
    return (
        <View className="items-center gap-3 py-6" testID={testID}>
            <Text className="text-center text-sm font-medium text-foreground">{title}</Text>
            <EmptyHint hint={hint} />
            <EmptyAction action={action} testID={actionTestID} onAction={onAction} />
        </View>
    )
}
