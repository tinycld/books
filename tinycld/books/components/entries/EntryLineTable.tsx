import { Text, View } from 'react-native'
import type { ReadyEntryDetail } from '../../hooks/useEntryDetail'
import { amountText } from '../../lib/money'

// Header and rows share these; Account and Memo take the free space, amounts never shrink.
export const LINE_COLUMNS = {
    index: { width: 44 },
    account: { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 140 },
    debit: { width: 116, flexShrink: 0 },
    credit: { width: 116, flexShrink: 0 },
    memo: { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 100 },
    menu: { width: 44, flexShrink: 0 },
} as const

const ROW_CLASS = 'flex-row items-center gap-2 border-b border-border px-2'

export interface EntryLinesProps {
    lines: ReadyEntryDetail['lines']
    accountNames: Map<string, string>
    currency: string
}

function HeadingText({ label }: { label: string }) {
    return <Text className="text-xs font-semibold uppercase text-muted-foreground">{label}</Text>
}

function HeadingRow() {
    return (
        <View className={ROW_CLASS} style={{ minHeight: 32 }}>
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
        </View>
    )
}

type Line = EntryLinesProps['lines'][number]

function LineRow({
    line,
    index,
    accountNames,
    currency,
}: {
    line: Line
    index: number
    accountNames: Map<string, string>
    currency: string
}) {
    return (
        <View testID={`entry-line-${index}`} className={ROW_CLASS} style={{ minHeight: 44 }}>
            <View style={LINE_COLUMNS.index} className="items-center">
                <Text className="text-sm text-muted-foreground">{index + 1}</Text>
            </View>
            <View style={LINE_COLUMNS.account} className="min-w-0">
                <Text
                    testID={`entry-line-account-${index}`}
                    numberOfLines={1}
                    className="text-sm text-foreground"
                >
                    {accountNames.get(line.account) ?? ''}
                </Text>
            </View>
            <View
                testID={`entry-line-debit-${index}`}
                style={LINE_COLUMNS.debit}
                className="items-end"
            >
                <Text className="text-sm text-foreground">{amountText(line.debit, currency)}</Text>
            </View>
            <View
                testID={`entry-line-credit-${index}`}
                style={LINE_COLUMNS.credit}
                className="items-end"
            >
                <Text className="text-sm text-foreground">{amountText(line.credit, currency)}</Text>
            </View>
            <View style={LINE_COLUMNS.memo} className="min-w-0">
                <Text
                    testID={`entry-line-memo-${index}`}
                    numberOfLines={1}
                    className="text-sm text-muted-foreground"
                >
                    {line.memo}
                </Text>
            </View>
        </View>
    )
}

export function EntryLineTable({ lines, accountNames, currency }: EntryLinesProps) {
    const rows = lines.map((line, index) => (
        <LineRow
            key={line.id}
            line={line}
            index={index}
            accountNames={accountNames}
            currency={currency}
        />
    ))
    return (
        <View testID="entry-lines">
            <HeadingRow />
            {rows}
        </View>
    )
}
