import { Text, View } from 'react-native'
import { AMOUNT_COLUMN_WIDTH } from '../../forms/invoice-line-cells'
import type { InvoiceScreenData } from '../../hooks/useInvoiceScreen'
import { formatMoney } from '../../lib/money'
import { ratePercentText } from '../../lib/sales-tax'

type ReadLine = InvoiceScreenData['lines'][number]

const GAP = 8
const QTY_WIDTH = 80
const RATE_WIDTH = 112
const TAX_WIDTH = 52
const PRODUCT_FLEX = { flex: 3, minWidth: 0 }
const DESCRIPTION_FLEX = { flex: 4, minWidth: 0 }
const ROW_GAP = { gap: GAP }
const QTY_CELL = { width: QTY_WIDTH }
const RATE_CELL = { width: RATE_WIDTH }
const AMOUNT_CELL = { width: AMOUNT_COLUMN_WIDTH }
const TAX_CELL = { width: TAX_WIDTH }
const FULL_CELL = { flex: 1 }
const CARD_CELL = {}
// Right of a Subtotal's amount: the Tax column.
const SUBTOTAL_TRAILING = { width: TAX_WIDTH }

// The width right of the Amount column, so the totals under the lines end under Amount.
export const INVOICE_READ_TRAILING_WIDTH = TAX_WIDTH + GAP

const KIND_LABELS: Record<ReadLine['kind'], string> = {
    item: 'Item',
    description: 'Description',
    subtotal: 'Subtotal',
    percent: 'Percent',
}

function productName(line: ReadLine): string {
    return line.productRow?.name ?? ''
}

// Qty column: an Item's quantity, a Percent line's percent ("−10%").
function qtyText(line: ReadLine): string {
    if (line.kind === 'percent') return ratePercentText(line.percent_ppm)
    if (line.kind === 'item') return String(line.quantity)
    return ''
}

function rateText(line: ReadLine, currency: string): string {
    return line.kind === 'item' ? formatMoney(line.rate, currency) : ''
}

function amountText(line: ReadLine, currency: string): string {
    return line.kind === 'description' ? '' : formatMoney(line.amount, currency)
}

interface CellProps {
    text: string
    style: object
    alignRight?: boolean
    isMuted?: boolean
}

function Cell({ text, style, alignRight = false, isMuted = false }: CellProps) {
    const align = alignRight ? 'text-right tabular-nums' : ''
    const tone = isMuted ? 'text-muted-foreground' : 'text-foreground'
    return (
        <Text style={style} className={`text-sm ${tone} ${align}`}>
            {text}
        </Text>
    )
}

function HeadCell({
    label,
    style,
    alignRight = false,
}: Omit<CellProps, 'text'> & { label: string }) {
    const align = alignRight ? 'text-right' : ''
    return (
        <Text style={style} className={`text-xs font-medium text-muted-foreground ${align}`}>
            {label}
        </Text>
    )
}

function GridHeader() {
    return (
        <View className="flex-row border-b border-border pb-2" style={ROW_GAP}>
            <HeadCell label="Product or service" style={PRODUCT_FLEX} />
            <HeadCell label="Description" style={DESCRIPTION_FLEX} />
            <HeadCell label="Qty" style={QTY_CELL} alignRight />
            <HeadCell label="Price" style={RATE_CELL} alignRight />
            <HeadCell label="Amount" style={AMOUNT_CELL} alignRight />
            <HeadCell label="Tax" style={TAX_CELL} />
        </View>
    )
}

function GridRow({ line, currency }: { line: ReadLine; currency: string }) {
    const amount = amountText(line, currency)
    if (line.kind === 'description') {
        return <Cell text={line.description} style={FULL_CELL} />
    }
    if (line.kind === 'subtotal') {
        return (
            <View className="flex-row" style={ROW_GAP}>
                <Text className="flex-1 text-right text-sm font-medium text-foreground">
                    Subtotal
                </Text>
                <Cell text={amount} style={AMOUNT_CELL} alignRight />
                <View style={SUBTOTAL_TRAILING} />
            </View>
        )
    }
    const product = productName(line)
    const qty = qtyText(line)
    const rate = rateText(line, currency)
    const taxText = line.taxable ? 'Yes' : ''
    return (
        <View className="flex-row items-start" style={ROW_GAP}>
            <Cell text={product} style={PRODUCT_FLEX} />
            <Cell text={line.description} style={DESCRIPTION_FLEX} isMuted />
            <Cell text={qty} style={QTY_CELL} alignRight />
            <Cell text={rate} style={RATE_CELL} alignRight />
            <Cell text={amount} style={AMOUNT_CELL} alignRight />
            <Cell text={taxText} style={TAX_CELL} />
        </View>
    )
}

function Grid({ lines, currency }: { lines: ReadLine[]; currency: string }) {
    const rows = lines.map(line => (
        <View
            key={line.id}
            testID={`invoice-line-${line.id}`}
            className="border-b border-border py-2.5"
        >
            <GridRow line={line} currency={currency} />
        </View>
    ))
    return (
        <View testID="invoice-lines">
            <GridHeader />
            {rows}
        </View>
    )
}

function cardTitle(line: ReadLine, index: number): string {
    const name = productName(line)
    return name ? `${index + 1} · ${name}` : `${index + 1} · ${KIND_LABELS[line.kind]}`
}

function cardDetail(line: ReadLine, currency: string): string {
    if (line.kind === 'item') {
        const taxable = line.taxable ? ' · Taxable' : ''
        return `${qtyText(line)} × ${rateText(line, currency)}${taxable}`
    }
    if (line.kind === 'percent') return `${qtyText(line)} of the line above`
    return ''
}

function Card({ line, index, currency }: { line: ReadLine; index: number; currency: string }) {
    const description = line.kind === 'subtotal' ? '' : line.description
    const title = cardTitle(line, index)
    const amount = amountText(line, currency)
    const detail = cardDetail(line, currency)
    return (
        <View
            testID={`invoice-line-${line.id}`}
            className="mb-2 gap-1 rounded-lg border border-border bg-background p-3"
        >
            <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</Text>
                <Text className="text-sm tabular-nums text-foreground">{amount}</Text>
            </View>
            <Cell text={description} style={CARD_CELL} isMuted />
            <Cell text={detail} style={CARD_CELL} isMuted />
        </View>
    )
}

interface InvoiceReadLinesProps {
    lines: ReadLine[]
    currency: string
    isPhone: boolean
}

/**
 * A posted or void invoice's lines, read only, with the amounts the server stored: a grid
 * on a wide screen (the form's columns without the row menu), a card per line on a phone.
 */
export function InvoiceReadLines({ lines, currency, isPhone }: InvoiceReadLinesProps) {
    if (!isPhone) return <Grid lines={lines} currency={currency} />
    const cards = lines.map((line, index) => (
        <Card key={line.id} line={line} index={index} currency={currency} />
    ))
    return <View testID="invoice-lines">{cards}</View>
}
