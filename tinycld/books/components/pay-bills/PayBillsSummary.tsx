import { Text, View } from 'react-native'
import type { PayBillsFormState } from '../../hooks/usePayBillsForm'
import { PayBillsBalances } from './PayBillsBalances'

function MutedLine({
    isVisible,
    text,
    testID,
}: {
    isVisible: boolean
    text: string
    testID: string
}) {
    if (!isVisible) return null
    return (
        <Text testID={testID} className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

interface PayBillsSummaryProps {
    payForm: PayBillsFormState
    isPhone: boolean
    isVisible: boolean
}

/**
 * Under the list (spec §3.4): at the left the selection ("3 bills selected · 2 vendors"),
 * the check plan with Check and a starting number, and the note of paid rows a filter
 * hides; at the right the balance lines. Stacked on a phone.
 */
export function PayBillsSummary({ payForm, isPhone, isVisible }: PayBillsSummaryProps) {
    if (!isVisible) return null
    const layout = isPhone ? 'gap-3' : 'flex-row items-start justify-between gap-4'
    return (
        <View testID="pay-bills-summary" className={layout}>
            <View className="min-w-0 shrink gap-1">
                <Text testID="pay-bills-selected" className="text-sm text-foreground">
                    {payForm.selectedText}
                </Text>
                <MutedLine
                    isVisible={payForm.isCheckPlanVisible}
                    text={payForm.checkPlanText}
                    testID="pay-bills-check-plan"
                />
                <MutedLine
                    isVisible={payForm.isHiddenVisible}
                    text={payForm.hiddenText}
                    testID="pay-bills-hidden"
                />
            </View>
            <PayBillsBalances balances={payForm.balances} />
        </View>
    )
}
