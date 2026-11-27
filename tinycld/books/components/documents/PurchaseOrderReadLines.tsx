import { TABLE_INPUT_TEXT_INSET } from '@tinycld/core/ui/forms/fields/table-layout'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View } from 'react-native'
import {
    type DocumentReadLine,
    isOrderReadLine,
    type PurchaseOrderReadLine as ReadLine,
} from '../../hooks/document-data'
import { formatMoney } from '../../lib/money'
import type { DocumentLineTable } from '../../lib/sales-document-kinds'
import { type CellWidth, showsTableCards, tableMinWidth } from '../../lib/table-fit'
import { DOCUMENT_READ_TRAILING_WIDTH, type DocumentReadLinesProps } from './DocumentReadLines'
import { useDocumentKind } from './document-kind-context'
import { ReadCell as Cell, READ_GAP as GAP, ReadHeadCell as HeadCell } from './read-line-cells'

const DASH = '—'

// The Amount column ends where the totals' figures under the lines end, as the bill's read
// lines (PurchaseReadLines).
const ROW_PADDING = DOCUMENT_READ_TRAILING_WIDTH + TABLE_INPUT_TEXT_INSET
const ROW_STYLE = { gap: GAP, paddingRight: ROW_PADDING }

// Product table (purchase order spec §3.6): Product or service · Description · Ordered ·
// Received · Open · Rate · Amount at least 150, 130, 70, 78, 104, 86, 96 px. Open is 104 px
// so "3 on a draft bill" stays on one line.
const ITEM_COLUMNS = {
    name: { flex: 3, minWidth: 150 },
    description: { flex: 4, minWidth: 130 },
    ordered: { width: 70 },
    received: { width: 78 },
    open: { width: 104 },
    rate: { width: 86 },
    amount: { width: 96 },
}

// Account table: Account · Description · Amount · Billed · Open at least 170, 150, 96, 96,
// 120 px (Open holds "$36.20 on a draft bill" on one line).
const ACCOUNT_COLUMNS = {
    name: { flex: 3, minWidth: 170 },
    description: { flex: 4, minWidth: 150 },
    amount: { width: 96 },
    billed: { width: 96 },
    open: { width: 120 },
}

// Each table's own minimum width (lib/table-fit.ts, the list layer's rule): its cells at
// their least widths, the gaps between them and the row's padding. Below it the table is
// cards, so it never scrolls sideways.
function minWidthOf(columns: Record<string, CellWidth>): number {
    return tableMinWidth({ cells: Object.values(columns), gap: GAP, padding: ROW_PADDING })
}
const ITEM_MIN_WIDTH = minWidthOf(ITEM_COLUMNS)
const ACCOUNT_MIN_WIDTH = minWidthOf(ACCOUNT_COLUMNS)

const ACCOUNT_KEY = 'account_lines'

function tableMinWidthOf(tableKey: string): number {
    return tableKey === ACCOUNT_KEY ? ACCOUNT_MIN_WIDTH : ITEM_MIN_WIDTH
}

// The width under which the order's read view draws some line table as cards: the widest
// minimum of the tables that have lines (0 with no line). Its footer stacks the totals above
// the notes there (DocumentKind.readFooterStacksBelow).
export function orderLinesCardsBelow(lines: readonly DocumentReadLine[]): number {
    const own = lines.filter(isOrderReadLine)
    const hasItem = own.some(line => line.kind === 'item')
    const hasAccount = own.some(line => line.kind === 'account')
    if (hasItem) return ITEM_MIN_WIDTH
    return hasAccount ? ACCOUNT_MIN_WIDTH : 0
}

function nameOf(line: ReadLine): string {
    if (line.kind === 'item') return line.productRow?.name ?? ''
    const account = line.accountRow
    if (!account) return ''
    return account.number ? `${account.number} ${account.name}` : account.name
}

// A product line's Vendor part no. (Q17); an account line never shows one.
function partNoOf(line: ReadLine): string {
    return line.kind === 'item' ? (line.productRow?.vendor_part_no ?? '') : ''
}

// Open: the open quantity of a product line, the open amount of an account line; "—" at 0.
function openText(line: ReadLine, currency: string): string {
    if (line.kind === 'item') return line.open_quantity > 0 ? String(line.open_quantity) : DASH
    return line.open_amount > 0 ? formatMoney(line.open_amount, currency) : DASH
}

function billedText(line: ReadLine, currency: string): string {
    return line.billed > 0 ? formatMoney(line.billed, currency) : DASH
}

function PartNo({ text }: { text: string }) {
    if (text === '') return null
    return <Text className="text-xs text-muted-foreground">{text}</Text>
}

function NameCell({ line, style }: { line: ReadLine; style: object }) {
    const name = nameOf(line)
    const partNo = partNoOf(line)
    return (
        <View style={style}>
            <Text className="text-sm text-foreground">{name}</Text>
            <PartNo text={partNo} />
        </View>
    )
}

// Open is medium weight while above zero (spec §3.6), "—" at zero.
function OpenCell({ line, currency, style }: { line: ReadLine; currency: string; style: object }) {
    const text = openText(line, currency)
    const weight = text === DASH ? '' : 'font-medium'
    const textClass = `text-right text-sm tabular-nums text-foreground ${weight}`
    return (
        <Text style={style} className={textClass}>
            {text}
        </Text>
    )
}

function GridHeader({ tableKey }: { tableKey: string }) {
    if (tableKey === ACCOUNT_KEY) {
        return (
            <View className="flex-row border-b border-border pb-2" style={ROW_STYLE}>
                <HeadCell label="Account" style={ACCOUNT_COLUMNS.name} />
                <HeadCell label="Description" style={ACCOUNT_COLUMNS.description} />
                <HeadCell label="Amount" style={ACCOUNT_COLUMNS.amount} alignRight />
                <HeadCell label="Billed" style={ACCOUNT_COLUMNS.billed} alignRight />
                <HeadCell label="Open" style={ACCOUNT_COLUMNS.open} alignRight />
            </View>
        )
    }
    return (
        <View className="flex-row border-b border-border pb-2" style={ROW_STYLE}>
            <HeadCell label="Product or service" style={ITEM_COLUMNS.name} />
            <HeadCell label="Description" style={ITEM_COLUMNS.description} />
            <HeadCell label="Ordered" style={ITEM_COLUMNS.ordered} alignRight />
            <HeadCell label="Received" style={ITEM_COLUMNS.received} alignRight />
            <HeadCell label="Open" style={ITEM_COLUMNS.open} alignRight />
            <HeadCell label="Rate" style={ITEM_COLUMNS.rate} alignRight />
            <HeadCell label="Amount" style={ITEM_COLUMNS.amount} alignRight />
        </View>
    )
}

interface LineProps {
    line: ReadLine
    currency: string
}

const ROW_CLASS = 'flex-row items-start border-b border-border py-2.5'

function ItemGridLine({ line, currency }: LineProps) {
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-read-line-${line.id}`
    const rate = formatMoney(line.rate, currency)
    const amount = formatMoney(line.amount, currency)
    return (
        <View testID={testID} className={ROW_CLASS} style={ROW_STYLE}>
            <NameCell line={line} style={ITEM_COLUMNS.name} />
            <Cell text={line.description} style={ITEM_COLUMNS.description} isMuted />
            <Cell text={String(line.quantity)} style={ITEM_COLUMNS.ordered} alignRight />
            <Cell text={String(line.received)} style={ITEM_COLUMNS.received} alignRight />
            <OpenCell line={line} currency={currency} style={ITEM_COLUMNS.open} />
            <Cell text={rate} style={ITEM_COLUMNS.rate} alignRight />
            <Cell text={amount} style={ITEM_COLUMNS.amount} alignRight />
        </View>
    )
}

function AccountGridLine({ line, currency }: LineProps) {
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-read-line-${line.id}`
    const amount = formatMoney(line.amount, currency)
    const billed = billedText(line, currency)
    return (
        <View testID={testID} className={ROW_CLASS} style={ROW_STYLE}>
            <NameCell line={line} style={ACCOUNT_COLUMNS.name} />
            <Cell text={line.description} style={ACCOUNT_COLUMNS.description} isMuted />
            <Cell text={amount} style={ACCOUNT_COLUMNS.amount} alignRight />
            <Cell text={billed} style={ACCOUNT_COLUMNS.billed} alignRight />
            <OpenCell line={line} currency={currency} style={ACCOUNT_COLUMNS.open} />
        </View>
    )
}

function GridLine({ line, currency }: LineProps) {
    if (line.kind === 'item') return <ItemGridLine line={line} currency={currency} />
    return <AccountGridLine line={line} currency={currency} />
}

// A card's counts line: "Ordered 10 · Received 4 · Open 6" on a product line, "Billed $x ·
// Open $y" on an account line.
function countsText(line: ReadLine, currency: string): string {
    const open = openText(line, currency)
    if (line.kind === 'item') {
        return `Ordered ${line.quantity} · Received ${line.received} · Open ${open}`
    }
    return `Billed ${billedText(line, currency)} · Open ${open}`
}

function rateText(line: ReadLine, currency: string): string {
    return line.kind === 'item' ? `Rate ${formatMoney(line.rate, currency)}` : ''
}

function CardLine({ text, isStrong = false }: { text: string; isStrong?: boolean }) {
    if (text === '') return null
    const tone = isStrong ? 'text-foreground' : 'text-muted-foreground'
    return <Text className={`text-sm ${tone}`}>{text}</Text>
}

interface CardProps extends LineProps {
    index: number
    rowLabel: string
}

// A line as a card: its name and amount, the Vendor part no., the description, the counts,
// then the rate.
function Card({ line, index, rowLabel, currency }: CardProps) {
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-read-line-${line.id}`
    const title = `${index + 1} · ${nameOf(line) || rowLabel}`
    const amount = formatMoney(line.amount, currency)
    const partNo = partNoOf(line)
    const counts = countsText(line, currency)
    const rate = rateText(line, currency)
    return (
        <View
            testID={testID}
            className="mb-2 gap-1 rounded-lg border border-border bg-background p-3"
        >
            <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</Text>
                <Text className="text-sm tabular-nums text-foreground">{amount}</Text>
            </View>
            <PartNo text={partNo} />
            <CardLine text={line.description} />
            <CardLine text={counts} isStrong />
            <CardLine text={rate} />
        </View>
    )
}

interface TableProps {
    table: DocumentLineTable
    lines: ReadLine[]
    currency: string
    isCards: boolean
}

// One table under its heading, as a grid or as a card per line. A table with no lines is
// not drawn.
function ReadTable({ table, lines, currency, isCards }: TableProps) {
    const { doc } = useDocumentKind()
    if (lines.length === 0) return null
    const tableId = `${doc.testId}-${table.key.replaceAll('_', '-')}`
    const headingId = `${tableId}-heading`
    const cards = lines.map((line, index) => (
        <Card
            key={line.id}
            line={line}
            index={index}
            rowLabel={table.rowLabel}
            currency={currency}
        />
    ))
    const rows = lines.map(line => <GridLine key={line.id} line={line} currency={currency} />)
    const header = isCards ? null : <GridHeader tableKey={table.key} />
    const body = isCards ? cards : rows
    return (
        <View testID={tableId} className="gap-2">
            <Text testID={headingId} className="text-sm font-semibold text-foreground">
                {table.heading}
            </Text>
            <View>
                {header}
                {body}
            </View>
        </View>
    )
}

/**
 * A purchase order's lines, read only, with what its posted bills received and billed and
 * what is still open (spec §3.6): one table per line table that has lines, under the form's
 * heading. Each table is a grid while the view's measured width holds its minimum, and a
 * card per line below it (and on a phone), so it never scrolls sideways.
 */
export function PurchaseOrderReadLines({ lines, currency, isPhone }: DocumentReadLinesProps) {
    const { doc, lineSpecs } = useDocumentKind()
    const { width, onLayout } = useContainerWidth()
    const orderLines = lines.filter(isOrderReadLine)
    const linesId = `${doc.testId}-lines`
    const measured = width > 0 ? width : null
    const tables = doc.lineTables.map(table => {
        const kinds = new Set(lineSpecs[table.key]?.rowKinds.map(rowKind => rowKind.key))
        const own = orderLines.filter(line => kinds.has(line.kind))
        const minWidth = tableMinWidthOf(table.key)
        const isCards = showsTableCards({ isPhone, width: measured, minWidth, gutter: 0 })
        return (
            <ReadTable
                key={table.key}
                table={table}
                lines={own}
                currency={currency}
                isCards={isCards}
            />
        )
    })
    return (
        <View testID={linesId} className="gap-4" onLayout={onLayout}>
            {tables}
        </View>
    )
}
