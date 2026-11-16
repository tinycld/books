import { Text, View } from 'react-native'
import { FieldError } from './PaymentMoneyField'

// The width of a total's figure, so the figures of the lines line up.
const FIGURE_WIDTH = 160

interface TotalLineProps {
    label: string
    amount: string
    isStrong: boolean
    testID: string
    // The figure in the danger tone (Pay Bills: a bank account's New balance below zero).
    isDanger?: boolean
}

// A total, its figure under the Payment column.
export function TotalLine({ label, amount, isStrong, testID, isDanger = false }: TotalLineProps) {
    const weight = isStrong ? 'font-semibold' : ''
    const rule = isStrong ? 'border-t border-border' : ''
    const tone = isDanger ? 'text-danger' : 'text-foreground'
    return (
        <View testID={testID} className={`flex-row items-center justify-end gap-4 py-1 ${rule}`}>
            <Text className={`text-sm text-muted-foreground ${weight}`}>{label}</Text>
            <Text
                className={`text-right text-base tabular-nums ${tone} ${weight}`}
                style={{ width: FIGURE_WIDTH }}
            >
                {amount}
            </Text>
        </View>
    )
}

interface CreditLineProps {
    // The credit as money; '' draws nothing (not above zero).
    credit: string
    note: string
    label: string
    testID: string
}

// What the payment keeps as the customer's credit, with its note.
export function CreditLine({ credit, note, label, testID }: CreditLineProps) {
    if (!credit) return null
    return (
        <View>
            <TotalLine label={label} amount={credit} isStrong testID={testID} />
            <Text testID="payment-credit-note" className="text-right text-xs text-muted-foreground">
                {note}
            </Text>
        </View>
    )
}

interface PaymentTotalsProps {
    isVisible: boolean
    apply: string
    credit: string
    creditNote: string
    // The live refusal when the payments add up to more than Amount received.
    over: string
}

// Under the list, right-aligned under the Payment column (spec §3.3).
export function PaymentTotals({ isVisible, apply, credit, creditNote, over }: PaymentTotalsProps) {
    if (!isVisible) return null
    return (
        <View testID="payment-totals" className="gap-1 self-end" style={{ minWidth: 320 }}>
            <TotalLine
                label="Amount to apply"
                amount={apply}
                isStrong={false}
                testID="payment-to-apply"
            />
            <CreditLine
                credit={credit}
                note={creditNote}
                label="Amount to credit"
                testID="payment-to-credit"
            />
            <FieldError message={over} testID="payment-over" />
        </View>
    )
}
