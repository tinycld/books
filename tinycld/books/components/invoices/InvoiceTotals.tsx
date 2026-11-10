import { Text, View } from 'react-native'
import { AMOUNT_COLUMN_WIDTH } from '../../forms/invoice-line-cells'

export type InvoiceTotalsView = {
    subtotal: string
    // Null with no tax chosen: no tax line shows.
    tax: { label: string; amount: string } | null
    total: string
    balance: string
}

interface TotalRowProps {
    label: string
    amount: string
    testID: string
    isStrong?: boolean
}

function TotalRow({ label, amount, testID, isStrong = false }: TotalRowProps) {
    const weight = isStrong ? 'font-semibold' : ''
    return (
        <View testID={testID} className="flex-row items-center justify-end gap-4 py-1">
            <Text className={`text-sm text-muted-foreground ${weight}`}>{label}</Text>
            <Text
                className={`text-right text-base text-foreground tabular-nums ${weight}`}
                style={{ minWidth: AMOUNT_COLUMN_WIDTH }}
            >
                {amount}
            </Text>
        </View>
    )
}

function TaxRow({ tax }: { tax: InvoiceTotalsView['tax'] }) {
    if (!tax) return null
    return <TotalRow label={tax.label} amount={tax.amount} testID="invoice-total-tax" />
}

// Subtotal, the header tax's one line, Total and Balance due, right-aligned so the
// figures end where the lines' Amount column ends.
export function InvoiceTotals({ totals }: { totals: InvoiceTotalsView }) {
    return (
        <View testID="invoice-totals">
            <TotalRow label="Subtotal" amount={totals.subtotal} testID="invoice-total-subtotal" />
            <TaxRow tax={totals.tax} />
            <View className="border-t border-border">
                <TotalRow label="Total" amount={totals.total} testID="invoice-total" isStrong />
            </View>
            <TotalRow
                label="Balance due"
                amount={totals.balance}
                testID="invoice-total-balance"
                isStrong
            />
        </View>
    )
}
