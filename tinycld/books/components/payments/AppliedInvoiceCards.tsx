import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import {
    type AppliedDocumentRow,
    cardDocumentLabel,
    type OutstandingDocument,
    outstandingTexts,
    totalTexts,
} from '../../lib/outstanding-documents'
import { formatDay } from '../../lib/register-range'
import { CARD, CardPair } from './OutstandingCards'
import { AppliedDocumentLink } from './OutstandingGrid'
import { TotalLine } from './PaymentTotals'

// Which day a paid document shows: its due date, or its own date (a vendor credit has no
// due date).
export type AppliedDateField = 'dueDate' | 'date'

export function appliedDayOf(field: AppliedDateField, row: AppliedDocumentRow): string {
    return formatDay(field === 'date' ? row.date : row.dueDate)
}

// A card's date line: "Due Nov 1, 2026", or the document's own date; '' with none.
function cardDayOf(field: AppliedDateField, row: AppliedDocumentRow): string {
    const day = field === 'date' ? row.date : row.dueDate
    if (!day) return ''
    const text = formatDay(day)
    return field === 'date' ? text : `Due ${text}`
}

// The card's date as a line of its own; hidden where the descriptor labels it.
function AppliedDayLine({ isVisible, text }: { isVisible: boolean; text: string }) {
    if (!isVisible) return null
    return <Text className="text-sm text-foreground">{text}</Text>
}

// The card's date as a label-value pair ("Credit date"); nothing where the descriptor has
// no date label.
function AppliedDayPair({ label, text }: { label: string | null; text: string }) {
    if (label === null) return null
    return <CardPair label={label} value={text} />
}

interface AppliedCardsProps {
    doc: OutstandingDocument
    rows: readonly AppliedDocumentRow[]
    currency: string
    testIdPrefix: string
    // The Total line's amount; null draws none.
    total: number | null
    dateField: AppliedDateField
}

function AppliedCard({
    doc,
    row,
    currency,
    testIdPrefix,
    dateField,
}: Omit<AppliedCardsProps, 'rows' | 'total'> & { row: AppliedDocumentRow }) {
    const texts = outstandingTexts(doc)
    const totalLabel = totalTexts(doc).card
    const label = cardDocumentLabel(doc, row)
    const due = cardDayOf(dateField, row)
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
            <AppliedDayLine isVisible={texts.cardDateLabel === null} text={due} />
            <View className="flex-row gap-3">
                <AppliedDayPair label={texts.cardDateLabel} text={due} />
                <CardPair label={totalLabel} value={original} />
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
    dateField,
}: AppliedCardsProps) {
    const drawn = rows.map(row => (
        <AppliedCard
            key={row.id}
            doc={doc}
            row={row}
            currency={currency}
            testIdPrefix={testIdPrefix}
            dateField={dateField}
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
