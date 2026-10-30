import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { EmptyAction } from '../../lib/report-state'
import { REPORT_TAP_TARGET } from './ReportHeader'

function EmptyActionButton({
    action,
    onAction,
}: {
    action: EmptyAction | null
    onAction: () => void
}) {
    if (!action) return null
    // A core Button, not EmptyState's action: that one is drawn in text-accent, which is
    // too faint in light mode.
    return (
        <Button
            testID="report-empty-action"
            variant="outline"
            style={{ minHeight: REPORT_TAP_TARGET }}
            onPress={onAction}
        >
            <ButtonText>{action.label}</ButtonText>
        </Button>
    )
}

interface ReportEmptyStateProps {
    message: string
    action: EmptyAction | null
    onAction: () => void
}

export function ReportEmptyState({ message, action, onAction }: ReportEmptyStateProps) {
    return (
        <View testID="report-empty" className="items-center gap-3 p-8">
            <Text
                testID="report-empty-message"
                className="text-center text-base font-medium text-foreground"
            >
                {message}
            </Text>
            <EmptyActionButton action={action} onAction={onAction} />
        </View>
    )
}
