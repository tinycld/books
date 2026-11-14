import { Text, View } from 'react-native'
import {
    type DocumentReadLine,
    isSalesReadLine,
    type SalesReadLine as ReadLine,
} from '../../hooks/document-data'
import { formatMoney } from '../../lib/money'
import { ratePercentText } from '../../lib/sales-tax'
import { useDocumentKind } from './document-kind-context'
import {
    READ_AMOUNT_CELL as AMOUNT_CELL,
    ReadCell as Cell,
    READ_DESCRIPTION_FLEX as DESCRIPTION_FLEX,
    READ_GAP as GAP,
    ReadHeadCell as HeadCell,
    READ_NAME_FLEX as PRODUCT_FLEX,
    READ_QTY_CELL as QTY_CELL,
    READ_RATE_CELL as RATE_CELL,
    ReadLineCard,
} from './read-line-cells'

const TAX_WIDTH = 52
const ROW_GAP = { gap: GAP }
const TAX_CELL = { width: TAX_WIDTH }
const FULL_CELL = { flex: 1 }
// Right of a Subtotal's amount: the Tax column.
const SUBTOTAL_TRAILING = { width: TAX_WIDTH }

// The width right of the Amount column, so the totals under the lines end under Amount.
export const DOCUMENT_READ_TRAILING_WIDTH = TAX_WIDTH + GAP

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

function GridLine({ line, currency }: { line: ReadLine; currency: string }) {
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-line-${line.id}`
    return (
        <View testID={testID} className="border-b border-border py-2.5">
            <GridRow line={line} currency={currency} />
        </View>
    )
}

function Grid({ lines, currency }: { lines: ReadLine[]; currency: string }) {
    const { doc } = useDocumentKind()
    const rows = lines.map(line => <GridLine key={line.id} line={line} currency={currency} />)
    const linesId = `${doc.testId}-lines`
    return (
        <View testID={linesId}>
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
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-line-${line.id}`
    return (
        <ReadLineCard
            testID={testID}
            title={title}
            amount={amount}
            description={description}
            detail={detail}
        />
    )
}

export interface DocumentReadLinesProps {
    // The kind's stored lines: each ReadLines draws those of its own line type.
    lines: DocumentReadLine[]
    currency: string
    isPhone: boolean
}

/**
 * A posted or void sales document's lines, read only, with the amounts the server stored:
 * a grid on a wide screen (the form's columns without the row menu), a card per line on a
 * phone.
 */
export function DocumentReadLines({ lines: stored, currency, isPhone }: DocumentReadLinesProps) {
    const { doc } = useDocumentKind()
    const lines = stored.filter(isSalesReadLine)
    if (!isPhone) return <Grid lines={lines} currency={currency} />
    const cards = lines.map((line, index) => (
        <Card key={line.id} line={line} index={index} currency={currency} />
    ))
    const linesId = `${doc.testId}-lines`
    return <View testID={linesId}>{cards}</View>
}
