import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

const TAP = { minHeight: 44 }

interface ApplyCreditNoticeProps {
    // A writer on a posted credit with unapplied credit, whose vendor's open bills read
    // landed with at least one bill. Hidden while that read is pending or failed: the
    // dialog shows the failure.
    isVisible: boolean
    vendorName: string
    openBills: number
    onApply: () => void
}

function openBillsText(count: number): string {
    return count === 1 ? '1 open bill' : `${count} open bills`
}

/**
 * The vendor credit's notice (vendor credit spec §3.7): "Pacific Power has 2 open bills.
 * Apply this credit to lower what you pay." with Apply to bills, the read action's dialog.
 */
export function ApplyCreditNotice({
    isVisible,
    vendorName,
    openBills,
    onApply,
}: ApplyCreditNoticeProps) {
    if (!isVisible) return null
    const text = `${vendorName} has ${openBillsText(openBills)}. Apply this credit to lower what you pay.`
    return (
        <View
            testID="vendor-credit-apply-notice"
            className="flex-row flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-secondary p-4"
        >
            <Text className="min-w-0 flex-1 text-sm text-foreground">{text}</Text>
            <Button
                testID="vendor-credit-apply-notice-action"
                variant="outline"
                style={TAP}
                onPress={onApply}
            >
                <ButtonText>Apply to bills</ButtonText>
            </Button>
        </View>
    )
}
