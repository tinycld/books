import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Text, View } from 'react-native'
import type { AuditFieldRow } from '../../lib/audit-fields'
import { FieldValue } from './FieldValue'

const HEADING_CLASS = 'flex-1 text-xs font-medium text-muted-foreground'
const CELL_CLASS = 'min-w-0 flex-1'

// How an event's values read: in its currency, and inside which history (historyKey),
// where a failed read of a value reports.
interface ValueContext {
    currency: string
    history: string
}

interface FieldChangesProps extends ValueContext {
    rows: AuditFieldRow[]
    // A Deleted event's last values: Field | Value (the value is in `after`).
    isSnapshot: boolean
}

interface RowProps extends ValueContext {
    row: AuditFieldRow
    isSnapshot: boolean
}

function BeforeCell({ isVisible, row, currency, history }: RowProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className={CELL_CLASS}>
            <FieldValue
                field={row.field}
                value={row.before}
                currency={currency}
                history={history}
            />
        </View>
    )
}

function TableRow({ row, isSnapshot, currency, history }: RowProps) {
    return (
        <View className="flex-row gap-3 border-t border-border py-2">
            <Text className="min-w-0 flex-1 text-sm text-muted-foreground">{row.label}</Text>
            <BeforeCell
                isVisible={!isSnapshot}
                row={row}
                isSnapshot={isSnapshot}
                currency={currency}
                history={history}
            />
            <View className={CELL_CLASS}>
                <FieldValue
                    field={row.field}
                    value={row.after}
                    currency={currency}
                    history={history}
                />
            </View>
        </View>
    )
}

function AfterHeading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className={HEADING_CLASS}>After</Text>
}

function FieldTable({ rows, isSnapshot, currency, history }: FieldChangesProps) {
    const valueHeading = isSnapshot ? 'Value' : 'Before'
    const tableRows = rows.map(row => (
        <TableRow
            key={row.key}
            row={row}
            isSnapshot={isSnapshot}
            currency={currency}
            history={history}
        />
    ))
    return (
        <View>
            <View className="flex-row gap-3 pb-1">
                <Text className={HEADING_CLASS}>Field</Text>
                <Text className={HEADING_CLASS}>{valueHeading}</Text>
                <AfterHeading isVisible={!isSnapshot} />
            </View>
            {tableRows}
        </View>
    )
}

interface CardValueProps extends ValueContext {
    isVisible: boolean
    label: string
    row: AuditFieldRow
    value: unknown
}

function CardValue({ isVisible, label, row, value, currency, history }: CardValueProps) {
    if (!isVisible) return null
    return (
        <View className="flex-row gap-2">
            <Text className="text-sm text-muted-foreground">{label}</Text>
            <View className={CELL_CLASS}>
                <FieldValue field={row.field} value={value} currency={currency} history={history} />
            </View>
        </View>
    )
}

function FieldCard({ row, isSnapshot, currency, history }: RowProps) {
    return (
        <View className="gap-1 border-t border-border py-2">
            <Text className="text-sm font-medium text-foreground">{row.label}</Text>
            <CardValue
                isVisible={isSnapshot}
                label="Value"
                row={row}
                value={row.after}
                currency={currency}
                history={history}
            />
            <CardValue
                isVisible={!isSnapshot}
                label="Before"
                row={row}
                value={row.before}
                currency={currency}
                history={history}
            />
            <CardValue
                isVisible={!isSnapshot}
                label="After"
                row={row}
                value={row.after}
                currency={currency}
                history={history}
            />
        </View>
    )
}

// On a phone each field is a card: its label, then Before, then After (spec §3 Phone).
function FieldCards({ rows, isSnapshot, currency, history }: FieldChangesProps) {
    const cards = rows.map(row => (
        <FieldCard
            key={row.key}
            row={row}
            isSnapshot={isSnapshot}
            currency={currency}
            history={history}
        />
    ))
    return <View>{cards}</View>
}

/**
 * An event's fields: a Field | Before | After table (Field | Value for a delete) on a
 * wide window, one card per field on a phone; "No visible fields changed" when only
 * internal keys changed.
 */
export function FieldChanges(props: FieldChangesProps) {
    const isPhone = useBreakpoint() === 'mobile'
    if (props.rows.length === 0) {
        return <Text className="text-sm text-muted-foreground">No visible fields changed</Text>
    }
    if (isPhone) return <FieldCards {...props} />
    return <FieldTable {...props} />
}
