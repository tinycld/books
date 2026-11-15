import { Text, View } from 'react-native'
import { AMOUNT_TEXT_STYLE } from '../../forms/document-line-cells'
import type { DocumentTableSubtotal } from '../../lib/document-tax'
import { useDocumentKind } from './document-kind-context'

export type DocumentTotalsView = {
    // Null on a kind with more than one line table: no Subtotal row shows.
    subtotal: string | null
    // Each line table's own subtotal row, in table order, above Total.
    tableSubtotals: DocumentTableSubtotal[]
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

// Every label ends at the same edge, left of its amount, on one line: a tax label longer
// than the panel holds (a long rate name) ends with an ellipsis rather than wrapping.
function TotalRow({ label, amount, testID, isStrong = false }: TotalRowProps) {
    const weight = isStrong ? 'font-semibold' : ''
    const labelClass = `shrink text-right text-sm text-muted-foreground ${weight}`
    const amountClass = `shrink-0 text-right text-base text-foreground tabular-nums ${weight}`
    return (
        <View testID={testID} className="flex-row items-center justify-end gap-4 py-1">
            <Text className={labelClass} numberOfLines={1}>
                {label}
            </Text>
            <Text className={amountClass} style={AMOUNT_TEXT_STYLE}>
                {amount}
            </Text>
        </View>
    )
}

function SubtotalRow({ amount, testID }: { amount: string | null; testID: string }) {
    if (amount === null) return null
    return <TotalRow label="Subtotal" amount={amount} testID={testID} />
}

function TaxRow({ tax, testID }: { tax: DocumentTotalsView['tax']; testID: string }) {
    if (!tax) return null
    return <TotalRow label={tax.label} amount={tax.amount} testID={testID} />
}

// The kind's last row (Balance due on an invoice); a kind with none (an estimate) draws
// nothing.
function LastRow({ amount }: { amount: string }) {
    const { doc } = useDocumentKind()
    const last = doc.lastTotal
    if (!last) return null
    const testID = `${doc.testId}-${last.testId}`
    return <TotalRow label={last.label} amount={amount} testID={testID} isStrong />
}

// Each line table's own subtotal (a kind with more than one table), in table order.
function TableSubtotalRows({ rows }: { rows: DocumentTableSubtotal[] }) {
    const { doc } = useDocumentKind()
    const drawn = rows.map(row => (
        <TotalRow
            key={row.testId}
            label={row.label}
            amount={row.amount}
            testID={`${doc.testId}-${row.testId}`}
        />
    ))
    return <>{drawn}</>
}

// Subtotal (or each table's subtotal), the header tax's one line, Total and the kind's
// last row, right-aligned so the figures end where the lines' Amount column ends.
export function DocumentTotalsPanel({ totals }: { totals: DocumentTotalsView }) {
    const { doc } = useDocumentKind()
    const testId = doc.testId
    const ids = {
        totals: `${testId}-totals`,
        subtotal: `${testId}-total-subtotal`,
        tax: `${testId}-total-tax`,
        total: `${testId}-total`,
    }
    return (
        <View testID={ids.totals}>
            <SubtotalRow amount={totals.subtotal} testID={ids.subtotal} />
            <TableSubtotalRows rows={totals.tableSubtotals} />
            <TaxRow tax={totals.tax} testID={ids.tax} />
            <View className="border-t border-border">
                <TotalRow label="Total" amount={totals.total} testID={ids.total} isStrong />
            </View>
            <LastRow amount={totals.last} />
        </View>
    )
}
