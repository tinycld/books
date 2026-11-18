import { Text, View } from 'react-native'
import type { PaymentFlow, PaymentTotalLine } from '../../lib/payment-flow'
import { fillPaymentText } from '../../lib/payment-texts'
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
    noteTestID: string
}

// What the payment keeps as the customer's credit, with its note.
export function CreditLine({ credit, note, label, testID, noteTestID }: CreditLineProps) {
    if (!credit) return null
    return (
        <View>
            <TotalLine label={label} amount={credit} isStrong testID={testID} />
            <Text testID={noteTestID} className="text-right text-xs text-muted-foreground">
                {note}
            </Text>
        </View>
    )
}

interface FlowTotalLineProps {
    line: PaymentTotalLine
    testID: string
    // The name the note's `%s` names.
    partyName: string
    noteTestID: string
}

// One of the flow's lines under the list, with its note under it when it has one.
function FlowTotalLine({ line, testID, partyName, noteTestID }: FlowTotalLineProps) {
    const note = line.note === '' ? '' : fillPaymentText(line.note, partyName)
    const total = (
        <TotalLine
            label={line.label}
            amount={line.amount}
            isStrong={line.isStrong}
            isDanger={line.isDanger}
            testID={testID}
        />
    )
    if (note === '') return total
    return (
        <View>
            {total}
            <Text testID={noteTestID} className="text-right text-xs text-muted-foreground">
                {note}
            </Text>
        </View>
    )
}

interface PaymentTotalsProps {
    isVisible: boolean
    // The lines are drawn; false draws the sum refusal alone (an 'exact' flow's party
    // with no open document: nothing to total, but Post is still refused).
    hasLines: boolean
    flow: PaymentFlow
    // The flow's lines (`flow.totals`), and the party's name their notes name.
    lines: readonly PaymentTotalLine[]
    partyName: string
    // The live sum refusal (`sumErrorOf`): the rows add up to more than the amount, or,
    // under the flow's 'exact' rule, to less; '' draws nothing.
    sumError: string
}

// Under the list, right-aligned under the Payment column (spec §3.3).
export function PaymentTotals({
    isVisible,
    hasLines,
    flow,
    lines,
    partyName,
    sumError,
}: PaymentTotalsProps) {
    if (!isVisible) return null
    const prefix = flow.testId
    const sumErrorID = `${prefix}-${flow.ids.sumError}`
    if (!hasLines) {
        return (
            <View className="self-end" style={{ minWidth: 320 }}>
                <FieldError message={sumError} testID={sumErrorID} />
            </View>
        )
    }
    const drawn = lines.map(line => (
        <FlowTotalLine
            key={line.id}
            line={line}
            testID={`${prefix}-${line.id}`}
            partyName={partyName}
            noteTestID={`${prefix}-${flow.ids.totalNote}`}
        />
    ))
    return (
        <View testID={`${prefix}-totals`} className="gap-1 self-end" style={{ minWidth: 320 }}>
            {drawn}
            <FieldError message={sumError} testID={sumErrorID} />
        </View>
    )
}
