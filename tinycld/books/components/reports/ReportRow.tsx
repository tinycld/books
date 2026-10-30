import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type {
    ReportColumn,
    ReportModelRow,
    ReportNumberFormat,
    ReportRowKind,
} from '../../lib/report-definition'
import { type CellDisplay, cellDisplay } from '../../lib/report-format'
import type { VisibleReportRow } from '../../lib/report-rows'
import { columnAlign, INDENT, type ReportTableLayout, ROW_HEIGHT } from './report-table-layout'

// The rule above a row. The label and amount stacks draw it alike, so it runs the full width.
const ROW_RULE: Record<ReportRowKind, string> = {
    section: '',
    detail: '',
    subtotal: 'border-t border-border',
    total: 'border-t-2 border-foreground',
}

const ROW_WEIGHT: Record<ReportRowKind, string> = {
    section: 'font-semibold',
    detail: '',
    subtotal: 'font-semibold',
    total: 'font-semibold',
}

const CARET_SIZE = 14

function labelRowStyle(row: ReportModelRow) {
    return { height: ROW_HEIGHT, paddingLeft: INDENT + row.depth * INDENT }
}

function SectionCaret({ isFolded }: { isFolded: boolean }) {
    const color = useThemeColor('muted-foreground')
    const Icon = isFolded ? ChevronRight : ChevronDown
    return <Icon size={CARET_SIZE} color={color} />
}

function LabelText({ row }: { row: ReportModelRow }) {
    return (
        <Text
            numberOfLines={1}
            className={`min-w-0 flex-1 text-sm text-foreground ${ROW_WEIGHT[row.kind]}`}
        >
            {row.label}
        </Text>
    )
}

interface ReportRowLabelProps {
    item: VisibleReportRow
    onToggleSection(sectionId: string): void
}

// A role-button Pressable takes a click, Enter and Space on web and a tap on native.
function SectionLabel({ item, onToggleSection }: ReportRowLabelProps) {
    const { row } = item
    return (
        <Pressable
            testID={`report-row-${row.id}`}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            aria-expanded={!item.isFolded}
            onPress={() => onToggleSection(row.id)}
            className="flex-row items-center gap-1 pr-3"
            style={labelRowStyle(row)}
        >
            <SectionCaret isFolded={item.isFolded} />
            <LabelText row={row} />
        </Pressable>
    )
}

export function ReportRowLabel({ item, onToggleSection }: ReportRowLabelProps) {
    const { row } = item
    if (row.kind === 'section') {
        return <SectionLabel item={item} onToggleSection={onToggleSection} />
    }
    return (
        <View
            testID={`report-row-${row.id}`}
            className={`flex-row items-center pr-3 ${ROW_RULE[row.kind]}`}
            style={labelRowStyle(row)}
        >
            <LabelText row={row} />
        </View>
    )
}

function cellTextClass(display: CellDisplay, align: 'left' | 'right', kind: ReportRowKind): string {
    const alignClass = align === 'right' ? 'text-right tabular-nums' : 'text-left'
    const tone = display.isRed || display.isError ? 'text-danger' : 'text-foreground'
    return `text-sm ${alignClass} ${tone} ${ROW_WEIGHT[kind]}`
}

interface AmountCellProps {
    item: VisibleReportRow
    column: ReportColumn
    // The column's place in `model.columns`; the label column is 0.
    index: number
    width: number
    currency: string
    numberFormat: ReportNumberFormat
}

function AmountCell({ item, column, index, width, currency, numberFormat }: AmountCellProps) {
    const { row } = item
    const value = item.cells[column.id] ?? null
    const display = cellDisplay(column, row.kind, value, currency, numberFormat)
    const align = columnAlign(column, index)
    return (
        <View
            testID={`report-cell-${column.id}-${row.id}`}
            className={`justify-center px-3 ${ROW_RULE[row.kind]}`}
            style={{ width, height: ROW_HEIGHT }}
        >
            <Text numberOfLines={1} className={cellTextClass(display, align, row.kind)}>
                {display.text}
            </Text>
        </View>
    )
}

interface ReportRowAmountsProps {
    item: VisibleReportRow
    columns: ReportColumn[]
    layout: ReportTableLayout
    currency: string
    numberFormat: ReportNumberFormat
    onToggleSection(sectionId: string): void
}

// `columns` are the amount columns, the ones after the label column. A section row's
// cells are empty while it is unfolded and its subtotal's when folded (`item.cells`).
export function ReportRowAmounts({
    item,
    columns,
    layout,
    currency,
    numberFormat,
    onToggleSection,
}: ReportRowAmountsProps) {
    const cells = columns.map((column, i) => (
        <AmountCell
            key={column.id}
            item={item}
            column={column}
            index={i + 1}
            width={layout.amountWidth}
            currency={currency}
            numberFormat={numberFormat}
        />
    ))
    // The label side is the row's one accessible toggle. This side takes the same press but
    // is not a button and has no tab stop, because a labelled button would hide the folded
    // subtotal figures from screen readers.
    if (item.row.kind === 'section') {
        return (
            <Pressable
                onPress={() => onToggleSection(item.row.id)}
                accessible={false}
                tabIndex={-1}
                className="flex-row"
            >
                {cells}
            </Pressable>
        )
    }
    return <View className="flex-row">{cells}</View>
}
