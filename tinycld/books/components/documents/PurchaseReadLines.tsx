import { TABLE_INPUT_TEXT_INSET } from '@tinycld/core/ui/forms/fields/table-layout'
import { Text, View } from 'react-native'
import { isPurchaseReadLine, type PurchaseReadLine as ReadLine } from '../../hooks/document-data'
import { formatMoney } from '../../lib/money'
import type { DocumentLineTable } from '../../lib/sales-document-kinds'
import { DOCUMENT_READ_TRAILING_WIDTH, type DocumentReadLinesProps } from './DocumentReadLines'
import { useDocumentKind } from './document-kind-context'
import {
    READ_AMOUNT_CELL as AMOUNT_CELL,
    ReadCell as Cell,
    READ_DESCRIPTION_FLEX as DESCRIPTION_FLEX,
    READ_GAP as GAP,
    ReadHeadCell as HeadCell,
    READ_NAME_FLEX as NAME_FLEX,
    READ_QTY_CELL as QTY_CELL,
    READ_RATE_CELL as RATE_CELL,
    ReadLineCard,
} from './read-line-cells'

// The Amount column ends where the totals' figures under the lines end: DocumentReadView
// pads the totals by DOCUMENT_READ_TRAILING_WIDTH, and each figure keeps the form's input
// text inset to its right (AMOUNT_TEXT_STYLE), so the rows pad by both.
const ROW_STYLE = { gap: GAP, paddingRight: DOCUMENT_READ_TRAILING_WIDTH + TABLE_INPUT_TEXT_INSET }

// What a line names: an account line's account ("<number> <name>"), a product line's
// product or service.
function nameOf(line: ReadLine): string {
    if (line.kind === 'item') return line.productRow?.name ?? ''
    const account = line.accountRow
    if (!account) return ''
    return account.number ? `${account.number} ${account.name}` : account.name
}

function qtyText(line: ReadLine): string {
    return line.kind === 'item' ? String(line.quantity) : ''
}

function rateText(line: ReadLine, currency: string): string {
    return line.kind === 'item' ? formatMoney(line.rate, currency) : ''
}

// The read table's columns: the form's columns of the table without the row menu.
const ACCOUNT_KEY = 'account_lines'

function GridHeader({ tableKey }: { tableKey: string }) {
    if (tableKey === ACCOUNT_KEY) {
        return (
            <View className="flex-row border-b border-border pb-2" style={ROW_STYLE}>
                <HeadCell label="Account" style={NAME_FLEX} />
                <HeadCell label="Description" style={DESCRIPTION_FLEX} />
                <HeadCell label="Amount" style={AMOUNT_CELL} alignRight />
            </View>
        )
    }
    return (
        <View className="flex-row border-b border-border pb-2" style={ROW_STYLE}>
            <HeadCell label="Product or service" style={NAME_FLEX} />
            <HeadCell label="Description" style={DESCRIPTION_FLEX} />
            <HeadCell label="Qty" style={QTY_CELL} alignRight />
            <HeadCell label="Rate" style={RATE_CELL} alignRight />
            <HeadCell label="Amount" style={AMOUNT_CELL} alignRight />
        </View>
    )
}

interface LineProps {
    line: ReadLine
    currency: string
}

// An account line has no Qty or Rate cells; a product line has both.
function QtyRateCells({ line, currency }: LineProps) {
    if (line.kind !== 'item') return null
    const qty = qtyText(line)
    const rate = rateText(line, currency)
    return (
        <>
            <Cell text={qty} style={QTY_CELL} alignRight />
            <Cell text={rate} style={RATE_CELL} alignRight />
        </>
    )
}

function GridLine({ line, currency }: LineProps) {
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-line-${line.id}`
    const name = nameOf(line)
    const amount = formatMoney(line.amount, currency)
    return (
        <View
            testID={testID}
            className="flex-row items-start border-b border-border py-2.5"
            style={ROW_STYLE}
        >
            <Cell text={name} style={NAME_FLEX} />
            <Cell text={line.description} style={DESCRIPTION_FLEX} isMuted />
            <QtyRateCells line={line} currency={currency} />
            <Cell text={amount} style={AMOUNT_CELL} alignRight />
        </View>
    )
}

function cardTitle(line: ReadLine, index: number, rowLabel: string): string {
    const name = nameOf(line)
    return `${index + 1} · ${name || rowLabel}`
}

function cardDetail(line: ReadLine, currency: string): string {
    if (line.kind !== 'item') return ''
    return `${qtyText(line)} × ${rateText(line, currency)}`
}

interface CardProps extends LineProps {
    index: number
    rowLabel: string
}

function Card({ line, index, rowLabel, currency }: CardProps) {
    const { doc } = useDocumentKind()
    const testID = `${doc.testId}-line-${line.id}`
    const title = cardTitle(line, index, rowLabel)
    const amount = formatMoney(line.amount, currency)
    const detail = cardDetail(line, currency)
    return (
        <ReadLineCard
            testID={testID}
            title={title}
            amount={amount}
            description={line.description}
            detail={detail}
        />
    )
}

interface TableProps {
    table: DocumentLineTable
    lines: ReadLine[]
    currency: string
    isPhone: boolean
}

// One table under its heading: a grid on a wide screen, a card per line on a phone. A
// table with no lines is not drawn.
function ReadTable({ table, lines, currency, isPhone }: TableProps) {
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
    const header = isPhone ? null : <GridHeader tableKey={table.key} />
    const body = isPhone ? cards : rows
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
 * A posted or void bill's lines, read only, with the amounts the server stored: one table
 * per line table that has lines (whatever the Bill lines setting), under the form's
 * heading ("Account details", "Product and service details"), each line in the table of
 * its row kind. A grid on a wide screen, a card per line on a phone.
 */
export function PurchaseReadLines({ lines, currency, isPhone }: DocumentReadLinesProps) {
    const { doc, lineSpecs } = useDocumentKind()
    const purchaseLines = lines.filter(isPurchaseReadLine)
    const linesId = `${doc.testId}-lines`
    const tables = doc.lineTables.map(table => {
        const kinds = new Set(lineSpecs[table.key]?.rowKinds.map(rowKind => rowKind.key))
        const own = purchaseLines.filter(line => kinds.has(line.kind))
        return (
            <ReadTable
                key={table.key}
                table={table}
                lines={own}
                currency={currency}
                isPhone={isPhone}
            />
        )
    })
    return (
        <View testID={linesId} className="gap-4">
            {tables}
        </View>
    )
}
