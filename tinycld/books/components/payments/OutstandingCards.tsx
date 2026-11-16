import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import {
    cardDocumentLabel,
    type OutstandingDocument,
    outstandingTexts,
    rowTickLabel,
} from '../../lib/outstanding-documents'
import { entryCents } from '../../lib/payment-allocation'
import { SelectBox, type SelectBoxState } from '../SelectBox'
import {
    DocumentLink,
    DueText,
    type GridRowProps,
    type OutstandingGridProps,
} from './OutstandingGrid'
import { PaymentCell } from './PaymentCell'

// A label over its value, a half of the card's money pair.
export function CardPair({ label, value }: { label: string; value: string }) {
    return (
        <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className="text-sm text-foreground tabular-nums">{value}</Text>
        </View>
    )
}

export const CARD = 'gap-2 rounded-xl border border-border bg-background p-3'

// The card's top line: a bill card names its vendor beside the tick box and puts the link
// under it; an invoice card (one customer's list) puts the link there.
function CardTitle({
    doc,
    party,
    link,
}: {
    doc: OutstandingDocument
    party: string
    link: ReactNode
}) {
    if (doc.party === 'none') return <View className="min-w-0 flex-1">{link}</View>
    return (
        <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
            {party}
        </Text>
    )
}

// The link under the top line, on a card with a party; nothing on an invoice card, whose
// link is on the top line.
function CardLinkLine({ doc, link }: { doc: OutstandingDocument; link: ReactNode }) {
    if (doc.party === 'none') return null
    return <View className="min-w-0">{link}</View>
}

function DocumentCard({
    doc,
    row,
    payments,
    error,
    isLast,
    currency,
    today,
    isDisabled,
    onTick,
    onType,
    onNext,
    onFocusRow,
    rowRef,
}: GridRowProps) {
    const prefix = doc.testIdPrefix
    const texts = outstandingTexts(doc)
    const entry = payments[row.id]
    const tick: SelectBoxState = entryCents(entry, currency) > 0 ? 'checked' : 'empty'
    const handleTick = () => onTick(row)
    const original = formatMoney(row.total, currency)
    const open = formatMoney(row.open, currency)
    const value = entry?.amount ?? ''
    const cellRef = rowRef(row.id)
    const link = (
        <DocumentLink
            routeBase={doc.openKind.routeBase}
            documentId={row.id}
            label={cardDocumentLabel(doc, row)}
            testID={`${prefix}-row-link-${row.id}`}
        />
    )
    return (
        <View testID={`${prefix}-card-${row.id}`} className={CARD}>
            <View className="flex-row items-center gap-1">
                <SelectBox
                    state={tick}
                    label={rowTickLabel(doc, row.number)}
                    testID={`${prefix}-row-tick-${row.id}`}
                    onPress={handleTick}
                    isDisabled={isDisabled}
                    tabIndex={-1}
                />
                <CardTitle doc={doc} party={row.party ?? ''} link={link} />
            </View>
            <CardLinkLine doc={doc} link={link} />
            <DueText dueDate={row.due_date} today={today} />
            <View className="flex-row gap-3">
                <CardPair label={texts.totalCard} value={original} />
                <CardPair label="Open balance" value={open} />
            </View>
            <PaymentCell
                doc={doc}
                row={row}
                value={value}
                error={error}
                isLast={isLast}
                isDisabled={isDisabled}
                inputRef={cellRef}
                onType={onType}
                onNext={onNext}
                onFocusRow={onFocusRow}
            />
        </View>
    )
}

// The cards' touch path to the wide grid's header tick box: the same state and handler,
// so it pays every row it covers, or clears them all when every one is paid.
function TickAllBar({
    doc,
    tick,
    isDisabled,
    onTickAll,
}: {
    doc: OutstandingDocument
    tick: SelectBoxState
    isDisabled: boolean
    onTickAll: () => void
}) {
    return (
        <View className="flex-row items-center gap-1">
            <SelectBox
                state={tick}
                label={outstandingTexts(doc).payAllLabel}
                testID={`${doc.testIdPrefix}-tick-all`}
                onPress={onTickAll}
                isDisabled={isDisabled}
                tabIndex={-1}
            />
            <Text className="text-sm text-foreground">Pay all</Text>
        </View>
    )
}

/**
 * The open-document list while the list is narrower than the grid's least width
 * (`doc.gridMinWidth`; spec §3.3, pay-bills spec §3.3): a "Pay all" tick
 * box over the cards, then one card per document: the tick box and "Invoice 1004" on the
 * first line (a bill card: the tick box and the vendor, then "Bill 1003 · No. 88412"), the
 * due date, the total and Open balance as a label-value pair, and the Payment input at
 * full width. The tick boxes are press targets only; the card's one Tab stop is its
 * Payment input.
 */
export function OutstandingCards(props: OutstandingGridProps) {
    const { doc, rows, rowErrors, tickAll, isDisabled, onTickAll } = props
    const lastId = rows[rows.length - 1]?.id
    const drawn = rows.map(row => (
        <DocumentCard
            key={row.id}
            {...props}
            row={row}
            error={rowErrors[row.id] ?? ''}
            isLast={row.id === lastId}
        />
    ))
    return (
        <View testID={`${doc.testIdPrefix}-cards`} className="gap-3">
            <TickAllBar doc={doc} tick={tickAll} isDisabled={isDisabled} onTickAll={onTickAll} />
            {drawn}
        </View>
    )
}
