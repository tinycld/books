import { Text, View } from 'react-native'
import { AMOUNT_TEXT_STYLE } from '../../forms/document-line-cells'
import { useDocumentKind } from './document-kind-context'

export type DocumentTotalsView = {
    subtotal: string
    // Null with no tax chosen: no tax line shows.
    tax: { label: string; amount: string } | null
    total: string
    // The kind's last row (Balance due on an invoice).
    last: string
}

interface TotalRowProps {
    label: string
    amount: string
    testID: string
    isStrong?: boolean
}

function TotalRow({ label, amount, testID, isStrong = false }: TotalRowProps) {
    const weight = isStrong ? 'font-semibold' : ''
    const labelClass = `text-sm text-muted-foreground ${weight}`
    const amountClass = `text-right text-base text-foreground tabular-nums ${weight}`
    return (
        <View testID={testID} className="flex-row items-center justify-end gap-4 py-1">
            <Text className={labelClass}>{label}</Text>
            <Text className={amountClass} style={AMOUNT_TEXT_STYLE}>
                {amount}
            </Text>
        </View>
    )
}

function TaxRow({ tax, testID }: { tax: DocumentTotalsView['tax']; testID: string }) {
    if (!tax) return null
    return <TotalRow label={tax.label} amount={tax.amount} testID={testID} />
}

// Subtotal, the header tax's one line, Total and the kind's last row, right-aligned so
// the figures end where the lines' Amount column ends.
export function DocumentTotalsPanel({ totals }: { totals: DocumentTotalsView }) {
    const { doc } = useDocumentKind()
    const testId = doc.testId
    const ids = {
        totals: `${testId}-totals`,
        subtotal: `${testId}-total-subtotal`,
        tax: `${testId}-total-tax`,
        total: `${testId}-total`,
        last: `${testId}-${doc.lastTotal.testId}`,
    }
    return (
        <View testID={ids.totals}>
            <TotalRow label="Subtotal" amount={totals.subtotal} testID={ids.subtotal} />
            <TaxRow tax={totals.tax} testID={ids.tax} />
            <View className="border-t border-border">
                <TotalRow label="Total" amount={totals.total} testID={ids.total} isStrong />
            </View>
            <TotalRow label={doc.lastTotal.label} amount={totals.last} testID={ids.last} isStrong />
        </View>
    )
}
