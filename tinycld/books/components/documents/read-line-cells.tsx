// The cells and the line card of a document's read-only lines, shared by the sales read
// lines (DocumentReadLines) and the purchase read lines (PurchaseReadLines), so both draw
// their columns at the same widths.

import { Text, View } from 'react-native'
import { AMOUNT_COLUMN_WIDTH } from '../../forms/document-line-cells'

export const READ_GAP = 8
const QTY_WIDTH = 80
const RATE_WIDTH = 112
export const READ_NAME_FLEX = { flex: 3, minWidth: 0 }
export const READ_DESCRIPTION_FLEX = { flex: 4, minWidth: 0 }
export const READ_QTY_CELL = { width: QTY_WIDTH }
export const READ_RATE_CELL = { width: RATE_WIDTH }
export const READ_AMOUNT_CELL = { width: AMOUNT_COLUMN_WIDTH }
const CARD_CELL = {}

interface CellProps {
    text: string
    style: object
    alignRight?: boolean
    isMuted?: boolean
}

export function ReadCell({ text, style, alignRight = false, isMuted = false }: CellProps) {
    const align = alignRight ? 'text-right tabular-nums' : ''
    const tone = isMuted ? 'text-muted-foreground' : 'text-foreground'
    const textClass = `text-sm ${tone} ${align}`
    return (
        <Text style={style} className={textClass}>
            {text}
        </Text>
    )
}

export function ReadHeadCell({
    label,
    style,
    alignRight = false,
}: Omit<CellProps, 'text'> & { label: string }) {
    const align = alignRight ? 'text-right' : ''
    const textClass = `text-xs font-medium text-muted-foreground ${align}`
    return (
        <Text style={style} className={textClass}>
            {label}
        </Text>
    )
}

interface ReadLineCardProps {
    testID: string
    title: string
    amount: string
    description: string
    detail: string
}

// A line on a phone: its title and amount on top, its description and detail under them.
export function ReadLineCard({ testID, title, amount, description, detail }: ReadLineCardProps) {
    return (
        <View
            testID={testID}
            className="mb-2 gap-1 rounded-lg border border-border bg-background p-3"
        >
            <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</Text>
                <Text className="text-sm tabular-nums text-foreground">{amount}</Text>
            </View>
            <ReadCell text={description} style={CARD_CELL} isMuted />
            <ReadCell text={detail} style={CARD_CELL} isMuted />
        </View>
    )
}
