import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { DocumentListRow, DocumentListTab } from '../../lib/document-list'
import { cardLines, listCardHeight } from '../../lib/document-list-cells'
import { areaOf } from '../../lib/list-areas'
import { ListCards } from '../ListCards'
import { StatusBadge } from '../StatusBadge'
import { FocusBar, ROW_ON_FOCUS, ROW_TAB_INDEX, rowBackground } from './DocumentListTable'

interface DocumentListCardsProps {
    tab: DocumentListTab
    rows: readonly DocumentListRow[]
    currency: string
    onOpen(row: DocumentListRow): void
    onNearEnd(): void
    // The 44 px cells before and after a card's text (a tick box and a row menu); none
    // draws while they are not given.
    renderLead?(row: DocumentListRow): ReactNode
    renderTrail?(row: DocumentListRow): ReactNode
    // A ticked card draws `bg-accent`.
    isTicked?(id: string): boolean
    // The list keys' focused card ('' for none) draws the focus look (`rowBackground`,
    // `FocusBar`) and marks its open button `aria-current`; `scrollToIndex` keeps it in view.
    focusedId?: string
    scrollToIndex?: number
}

const EDGE_CELL_STYLE = { width: 44 }

// A card's padding at each end: none beside a 44 px cell, 16 px otherwise.
function cardClassOf(hasLead: boolean, hasTrail: boolean, bg: string): string {
    const start = hasLead ? '' : ' pl-4'
    const end = hasTrail ? '' : ' pr-4'
    return `flex-row items-center border-b border-border${start}${end} ${bg}`
}

function EdgeCell({ children }: { children: ReactNode }) {
    if (children === undefined || children === null) return null
    return <View style={EDGE_CELL_STYLE}>{children}</View>
}

function keyOfRow(row: DocumentListRow): string {
    return row.id
}

interface CardProps {
    row: DocumentListRow
    tab: DocumentListTab
    testIdPrefix: string
    currency: string
    height: number
    onOpen(row: DocumentListRow): void
    renderLead?(row: DocumentListRow): ReactNode
    renderTrail?(row: DocumentListRow): ReactNode
    isTicked: boolean
    isFocused: boolean
}

// Two lines: the title with the amount at the right, then the detail with the status
// badge at the right (`cardLines`).
function Card({
    row,
    tab,
    testIdPrefix,
    currency,
    height,
    onOpen,
    renderLead,
    renderTrail,
    isTicked,
    isFocused,
}: CardProps) {
    const { title, amount, detail } = cardLines(row, tab, currency)
    const lead = renderLead?.(row)
    const trail = renderTrail?.(row)
    const press = () => onOpen(row)
    const style = { height }
    const bg = rowBackground(isTicked, isFocused)
    const cardClass = cardClassOf(renderLead !== undefined, renderTrail !== undefined, bg)
    const current = isFocused ? 'true' : undefined
    return (
        <View className={cardClass} style={style}>
            <EdgeCell>{lead}</EdgeCell>
            <Pressable
                testID={`${testIdPrefix}-row-${row.id}`}
                accessibilityRole="button"
                aria-current={current}
                tabIndex={ROW_TAB_INDEX}
                onFocus={ROW_ON_FOCUS}
                onPress={press}
                className="min-w-0 flex-1 justify-center gap-1"
                style={style}
            >
                <View className="flex-row items-center justify-between gap-3">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {title}
                    </Text>
                    <Text className="text-sm font-medium text-foreground">{amount}</Text>
                </View>
                <View className="flex-row items-center justify-between gap-3">
                    <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
                        {detail}
                    </Text>
                    <StatusBadge
                        testID={`${testIdPrefix}-status-${row.id}`}
                        label={row.status.label}
                        tone={row.status.tone}
                    />
                </View>
            </Pressable>
            <EdgeCell>{trail}</EdgeCell>
            <FocusBar isVisible={isFocused} />
        </View>
    )
}

// A document list as cards, below the table's own minimum width: each card is its
// document's open button, drawn at `listCardHeight`. Test ids start with the area prefix.
export function DocumentListCards({
    tab,
    rows,
    currency,
    onOpen,
    onNearEnd,
    renderLead,
    renderTrail,
    isTicked,
    focusedId = '',
    scrollToIndex,
}: DocumentListCardsProps) {
    const prefix = areaOf(tab).testIdPrefix
    const renderCard = (row: DocumentListRow, height: number) => (
        <Card
            row={row}
            tab={tab}
            testIdPrefix={prefix}
            currency={currency}
            height={height}
            onOpen={onOpen}
            renderLead={renderLead}
            renderTrail={renderTrail}
            isTicked={isTicked?.(row.id) ?? false}
            isFocused={row.id === focusedId}
        />
    )
    return (
        <ListCards
            testID={`${prefix}-cards`}
            rows={rows}
            heightOf={listCardHeight}
            keyOf={keyOfRow}
            renderCard={renderCard}
            onNearEnd={onNearEnd}
            scrollToIndex={scrollToIndex}
        />
    )
}
