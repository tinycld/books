import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import {
    type AppliedDocumentRow,
    cardDocumentLabel,
    type OutstandingDocument,
    outstandingTexts,
} from '../../lib/outstanding-documents'
import { formatDay } from '../../lib/register-range'
import { CARD, CardPair } from './OutstandingCards'
import { AppliedDocumentLink } from './OutstandingGrid'
import { TotalLine } from './PaymentTotals'

interface AppliedCardsProps {
    doc: OutstandingDocument
    rows: readonly AppliedDocumentRow[]
    currency: string
    testIdPrefix: string
    // The Total line's amount; null draws none.
    total: number | null
}

function AppliedCard({
    doc,
    row,
    currency,
    testIdPrefix,
}: Omit<AppliedCardsProps, 'rows' | 'total'> & { row: AppliedDocumentRow }) {
    const texts = outstandingTexts(doc)
    const label = cardDocumentLabel(doc, row)
    const due = row.dueDate ? `Due ${formatDay(row.dueDate)}` : ''
    const original = formatMoney(row.total, currency)
    const applied = formatMoney(row.amount, currency)
    return (
        <View testID={`${testIdPrefix}-applied-${row.documentId}`} className={CARD}>
            <AppliedDocumentLink
                doc={doc}
                documentId={row.documentId}
                label={label}
                testID={`${testIdPrefix}-read-link-${row.documentId}`}
            />
            <Text className="text-sm text-foreground">{due}</Text>
            <View className="flex-row gap-3">
                <CardPair label={texts.totalCard} value={original} />
                <CardPair label={texts.appliedLabel} value={applied} />
            </View>
        </View>
    )
}

function CardsTotal({
    total,
    currency,
    testID,
}: {
    total: number | null
    currency: string
    testID: string
}) {
    if (total === null) return null
    const amount = formatMoney(total, currency)
    return <TotalLine label="Total" amount={amount} isStrong testID={testID} />
}

/**
 * A read view's paid documents while the list is narrower than the applied grid's least
 * width (`doc.appliedMinWidth`; receive-payment §3.7, pay-bills §3.8): one
 * card per invoice or bill with its link ("Bill 1003 · No. 88412"), its due date, and the
 * total and the paid amount as a label-value pair; with `total`, a Total line under them.
 */
export function AppliedInvoiceCards({
    doc,
    rows,
    currency,
    testIdPrefix,
    total,
}: AppliedCardsProps) {
    const drawn = rows.map(row => (
        <AppliedCard
            key={row.id}
            doc={doc}
            row={row}
            currency={currency}
            testIdPrefix={testIdPrefix}
        />
    ))
    return (
        <View testID={`${testIdPrefix}-applied`} className="gap-3">
            {drawn}
            <CardsTotal
                total={total}
                currency={currency}
                testID={`${testIdPrefix}-applied-total`}
            />
        </View>
    )
}
