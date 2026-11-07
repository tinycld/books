import { ScrollView, Text, View, type ViewStyle } from 'react-native'
import type { BankRow } from '../../../lib/bank-import'
import { ListHeaderCell } from '../../ListTable'

const SAMPLE_ROWS = 6
const LINE_WIDTH = 56
const COLUMN_WIDTH = 120
// Shared by header and body cells so their columns stay aligned: each column is at least
// COLUMN_WIDTH wide and the columns grow equally to fill the box.
const COLUMN_STYLE: ViewStyle = { minWidth: COLUMN_WIDTH, flexBasis: COLUMN_WIDTH, flexGrow: 1 }
const HEAD_STYLE: ViewStyle = { ...COLUMN_STYLE, paddingLeft: 8 }

function SampleCell({ text, isBold }: { text: string; isBold: boolean }) {
    const weight = isBold ? 'font-semibold' : ''
    return (
        <View className="px-2" style={COLUMN_STYLE}>
            <Text numberOfLines={1} className={`text-sm text-foreground ${weight}`}>
                {text}
            </Text>
        </View>
    )
}

function SampleRow({
    row,
    columns,
    isHeader,
}: {
    row: BankRow
    columns: number
    isHeader: boolean
}) {
    const cells = Array.from({ length: columns }, (_, i) => (
        <SampleCell key={i} text={row.cells[i] ?? ''} isBold={isHeader} />
    ))
    return (
        <View className="flex-row items-center border-b border-border" style={{ minHeight: 40 }}>
            <Text
                className="px-2 text-sm tabular-nums text-muted-foreground"
                style={{ width: LINE_WIDTH }}
            >
                {row.line}
            </Text>
            {cells}
        </View>
    )
}

// The file's first rows exactly as written, so the person can check each answer against
// them. The content is the box's width, so the columns share it equally; it scrolls
// sideways only when the columns at their least width are wider than the box.
export function SampleTable({
    rows,
    columns,
    headerRow,
}: {
    rows: readonly BankRow[]
    columns: number
    headerRow: boolean
}) {
    const minWidth = LINE_WIDTH + columns * COLUMN_WIDTH
    const heads = Array.from({ length: columns }, (_, i) => (
        <ListHeaderCell key={i} label={`Column ${i + 1}`} style={HEAD_STYLE} />
    ))
    const body = rows
        .slice(0, SAMPLE_ROWS)
        .map((row, i) => (
            <SampleRow key={row.line} row={row} columns={columns} isHeader={headerRow && i === 0} />
        ))
    return (
        <View className="gap-2">
            <Text className="text-base font-semibold text-foreground">Your file</Text>
            <ScrollView
                testID="bank-import-sample"
                horizontal
                className="rounded-lg border border-border"
                contentContainerStyle={{ width: '100%', minWidth }}
            >
                <View style={{ flexGrow: 1 }}>
                    <View
                        className="flex-row items-center border-b border-border"
                        style={{ minHeight: 36 }}
                    >
                        <ListHeaderCell
                            label="Line"
                            style={{ width: LINE_WIDTH, paddingLeft: 8 }}
                        />
                        {heads}
                    </View>
                    {body}
                </View>
            </ScrollView>
        </View>
    )
}
