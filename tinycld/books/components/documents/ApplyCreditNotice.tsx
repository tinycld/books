import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

const TAP = { minHeight: 44 }

interface ApplyCreditNoticeProps {
    // A writer on a posted credit with unapplied credit, whose party's open documents read
    // landed with at least one document (applyNoticeVisible), or a writer on a posted invoice
    // with an open balance whose customer's unapplied credit read landed with a credit memo.
    // Hidden while that read is pending or failed.
    isVisible: boolean
    // `<testID>` on the notice, `<testID>-action` on its button.
    testID: string
    text: string
    actionLabel: string
    onApply: () => void
    // A second part of the box under the text and the button (an invoice's payments line).
    children?: ReactNode
}

// The notice's box; the invoice's payments line alone uses it too (InvoiceApplyFrame).
export const APPLY_NOTICE_BOX = 'gap-3 rounded-xl border border-border bg-surface-secondary p-4'

/**
 * A notice above the band (vendor credit spec §3.7, apply credit spec §3.1): "Pacific Power
 * has 2 open bills. Apply this credit to lower what you pay." with Apply to bills, "Harbor
 * Lane Bakery has 2 open invoices. Apply this credit to lower what they owe." with Apply to
 * invoices, or "Harbor Lane Bakery has $250.00 of unapplied credit on 2 credit memos." with
 * Apply credit; the button opens the read action's dialog. The read frame gives the text, the
 * button's label, the test id and the box's second part (`children`).
 */
export function ApplyCreditNotice({
    isVisible,
    testID,
    text,
    actionLabel,
    onApply,
    children,
}: ApplyCreditNoticeProps) {
    if (!isVisible) return null
    return (
        <View testID={testID} className={APPLY_NOTICE_BOX}>
            <View className="flex-row flex-wrap items-center justify-between gap-4">
                <Text className="min-w-0 flex-1 text-sm text-foreground">{text}</Text>
                <Button testID={`${testID}-action`} variant="outline" style={TAP} onPress={onApply}>
                    <ButtonText>{actionLabel}</ButtonText>
                </Button>
            </View>
            {children}
        </View>
    )
}
