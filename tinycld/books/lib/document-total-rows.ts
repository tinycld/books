// The rows a read view's totals panel draws from Total down, in order (vendor credit spec
// §3.5, §3.10): Total, the payments applied, the kind's rows after Total (a bill's Credits
// applied, a vendor credit's Applied and Unapplied credit), then the kind's last row
// (Balance due). A kind with no last row (the vendor credit) ends with its own rows; a
// kind's rows after the last row (`afterLast`: a credit memo's Refunded and Unapplied
// credit, after "Credit amount") end the list. Pure.

// A row a read view's totals panel draws under Total (DocumentKind.readTotals): its label,
// its amount as text and its full test id.
export type DocumentTotalRow = { label: string; amount: string; testId: string; isStrong?: boolean }

export function totalRowOrder(rows: {
    total: DocumentTotalRow
    payments: DocumentTotalRow | null
    after: readonly DocumentTotalRow[]
    last: DocumentTotalRow | null
    afterLast?: readonly DocumentTotalRow[]
}): DocumentTotalRow[] {
    const { total, payments, after, last, afterLast = [] } = rows
    const ordered = [total]
    if (payments) ordered.push(payments)
    ordered.push(...after)
    if (last) ordered.push(last)
    ordered.push(...afterLast)
    return ordered
}
