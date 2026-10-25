import { Text, View } from 'react-native'
import { EntryLineRow, type LineActions } from './EntryLineRow'
import { LINE_COLUMNS } from './EntryLineTable'

interface EntryEditableLineTableProps {
    lineIds: string[]
    currency: string
    options: { value: string; label: string }[]
    actions: LineActions
}

function HeadingText({ label }: { label: string }) {
    return <Text className="text-xs font-semibold uppercase text-muted-foreground">{label}</Text>
}

function HeadingRow() {
    return (
        <View
            className="flex-row items-center gap-2 border-b border-border px-2"
            style={{ minHeight: 32 }}
        >
            <View style={LINE_COLUMNS.index} className="items-center">
                <HeadingText label="#" />
            </View>
            <View style={LINE_COLUMNS.account}>
                <HeadingText label="Account" />
            </View>
            <View style={LINE_COLUMNS.debit} className="items-end">
                <HeadingText label="Debit" />
            </View>
            <View style={LINE_COLUMNS.credit} className="items-end">
                <HeadingText label="Credit" />
            </View>
            <View style={LINE_COLUMNS.memo}>
                <HeadingText label="Memo" />
            </View>
            <View style={LINE_COLUMNS.menu} />
        </View>
    )
}

export function EntryEditableLineTable({
    lineIds,
    currency,
    options,
    actions,
}: EntryEditableLineTableProps) {
    const rows = lineIds.map((id, index) => (
        <EntryLineRow
            key={id}
            index={index}
            lineCount={lineIds.length}
            currency={currency}
            options={options}
            actions={actions}
        />
    ))
    return (
        <View testID="entry-lines">
            <HeadingRow />
            {rows}
        </View>
    )
}
