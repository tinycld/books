import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

const TAP = { minHeight: 44 }

interface ApplyCreditNoticeProps {
    // A writer on a posted credit with unapplied credit, whose party's open documents read
    // landed with at least one document (applyNoticeVisible). Hidden while that read is
    // pending or failed: the dialog shows the failure.
    isVisible: boolean
    // `<testID>` on the notice, `<testID>-action` on its button.
    testID: string
    text: string
    actionLabel: string
    onApply: () => void
}

/**
 * A credit's notice above the band (vendor credit spec §3.7, apply credit spec §3.1): "Pacific
 * Power has 2 open bills. Apply this credit to lower what you pay." with Apply to bills, or
 * "Harbor Lane Bakery has 2 open invoices. Apply this credit to lower what they owe." with
 * Apply to invoices; the button opens the read action's dialog. The frame of the credit's
 * kind gives the text, the button's label and the test id.
 */
export function ApplyCreditNotice({
    isVisible,
    testID,
    text,
    actionLabel,
    onApply,
}: ApplyCreditNoticeProps) {
    if (!isVisible) return null
    return (
        <View
            testID={testID}
            className="flex-row flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-secondary p-4"
        >
            <Text className="min-w-0 flex-1 text-sm text-foreground">{text}</Text>
            <Button testID={`${testID}-action`} variant="outline" style={TAP} onPress={onApply}>
                <ButtonText>{actionLabel}</ButtonText>
            </Button>
        </View>
    )
}
