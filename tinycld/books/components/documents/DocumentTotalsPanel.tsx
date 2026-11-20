import { Text, View } from 'react-native'
import { AMOUNT_TEXT_STYLE } from '../../forms/document-line-cells'
import type { DocumentTableSubtotal } from '../../lib/document-tax'
import { type DocumentTotalRow, totalRowOrder } from '../../lib/document-total-rows'
import { useDocumentKind } from './document-kind-context'

export type DocumentTotalsView = {
    // Null on a kind with more than one line table: no Subtotal row shows.
    subtotal: string | null
    // Each line table's own subtotal row, in table order, above Total.
    tableSubtotals: DocumentTableSubtotal[]
    // Null with no tax chosen: no tax line shows.
    tax: { label: string; amount: string } | null
    total: string
    // The sum the posted payments apply ("−$100.00"), above the last row; null or left out
    // when none applies (every form, and every kind but the invoice and the bill, the
    // kinds that payments pay). Credits applied and written off are rows of `after`, so
    // Payments, those rows and the last row add up to Total.
    payments?: string | null
    // The kind's last row (Balance due on an invoice and a bill, so the total less its
    // payments is what is still owed).
    last: string
    // The kind's rows drawn after Total, in order (a vendor credit's Applied and Unapplied
    // credit); left out by every form and by a kind without such rows.
    after?: readonly DocumentTotalRow[]
    // The kind's rows drawn after its last row, in order (a credit memo's Refunded and
    // Unapplied credit, after "Credit amount"); left out by every form and by a kind without
    // such rows.
    afterLast?: readonly DocumentTotalRow[]
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

// The rows under Total (totalRowOrder), each with its own full test id.
function BelowTotalRows({ rows }: { rows: readonly DocumentTotalRow[] }) {
    const drawn = rows.map(row => (
        <TotalRow
            key={row.testId}
            label={row.label}
            amount={row.amount}
            testID={row.testId}
            isStrong={row.isStrong}
        />
    ))
    return <>{drawn}</>
}

// Subtotal (or each table's subtotal), the header tax's one line, Total, then the rows
// totalRowOrder gives under it: the payments applied (an invoice's or a bill's read view),
// the kind's rows after Total (a bill's Credits applied, an invoice's Credits applied and
// Written off, a vendor credit's Applied and
// Unapplied credit), the kind's last row (Balance due; none for an estimate or a vendor
// credit) and the kind's rows after it (a credit memo's Refunded and Unapplied credit),
// right-aligned so the figures end where the lines' Amount column ends.
export function DocumentTotalsPanel({ totals }: { totals: DocumentTotalsView }) {
    const { doc } = useDocumentKind()
    const testId = doc.testId
    const ids = {
        totals: `${testId}-totals`,
        subtotal: `${testId}-total-subtotal`,
        tax: `${testId}-total-tax`,
    }
    const payments = totals.payments ?? null
    const last = doc.lastTotal
    const [total, ...belowTotal] = totalRowOrder({
        total: { label: 'Total', amount: totals.total, testId: `${testId}-total`, isStrong: true },
        payments:
            payments === null
                ? null
                : { label: 'Payments', amount: payments, testId: `${testId}-total-payments` },
        after: totals.after ?? [],
        last: last
            ? {
                  label: last.label,
                  amount: totals.last,
                  testId: `${testId}-${last.testId}`,
                  isStrong: true,
              }
            : null,
        afterLast: totals.afterLast ?? [],
    })
    return (
        <View testID={ids.totals}>
            <SubtotalRow amount={totals.subtotal} testID={ids.subtotal} />
            <TableSubtotalRows rows={totals.tableSubtotals} />
            <TaxRow tax={totals.tax} testID={ids.tax} />
            <View className="border-t border-border">
                <TotalRow
                    label={total.label}
                    amount={total.amount}
                    testID={total.testId}
                    isStrong={total.isStrong}
                />
            </View>
            <BelowTotalRows rows={belowTotal} />
        </View>
    )
}
