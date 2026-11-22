import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { Text, View } from 'react-native'
import type { DepositLineRow } from '../../hooks/useDepositRecord'
import { accountLabel } from '../../lib/account-options'
import { itemAmountText, partyNameOf } from '../../lib/deposit'
import { DEPOSIT_LINE_COLUMNS, depositReadLinesMinWidth } from '../../lib/deposit-columns'

const TAP = { minHeight: 44 }
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const CELL = 'text-sm text-foreground'
const MONEY_CELL = 'text-right text-sm tabular-nums'
const CARD = 'gap-1 rounded-xl border border-border bg-background p-3'
const SECTION_HEADING = 'text-sm font-semibold text-foreground'
const NO_PARTY = '—'

// One other funds line as the table and the cards draw it.
interface ReadLine {
    id: string
    party: string
    account: string
    description: string
    amount: string
    tone: string
}

function readLinesOf(lines: readonly DepositLineRow[], currency: string): ReadLine[] {
    return lines.map(line => ({
        id: line.id,
        party: partyNameOf(line),
        account: line.accountRow ? accountLabel(line.accountRow) : '',
        description: line.description,
        amount: itemAmountText(line.amount, currency),
        tone: line.amount < 0 ? 'text-danger' : 'text-foreground',
    }))
}

function TableHeader() {
    const col = DEPOSIT_LINE_COLUMNS
    return (
        <View className="flex-row items-center gap-3 border-b border-border px-2 py-2">
            <Text className={HEAD} style={col.party}>
                Received from
            </Text>
            <Text className={HEAD} style={col.account}>
                Account
            </Text>
            <Text className={HEAD} style={col.description}>
                Description
            </Text>
            <Text className={`${HEAD} text-right`} style={col.amount}>
                Amount
            </Text>
        </View>
    )
}

// The read table has no Remove column: its cells are the form table's data columns.
function TableRow({ line }: { line: ReadLine }) {
    const col = DEPOSIT_LINE_COLUMNS
    return (
        <View
            testID={`deposit-read-line-${line.id}`}
            className="flex-row items-center gap-3 border-b border-border px-2"
            style={TAP}
        >
            <Text className={CELL} style={col.party} numberOfLines={1}>
                {line.party}
            </Text>
            <Text className={CELL} style={col.account} numberOfLines={1}>
                {line.account}
            </Text>
            <Text className={CELL} style={col.description} numberOfLines={1}>
                {line.description}
            </Text>
            <Text className={`${MONEY_CELL} ${line.tone}`} style={col.amount}>
                {line.amount}
            </Text>
        </View>
    )
}

function LineTable({ lines }: { lines: ReadLine[] }) {
    const rows = lines.map(line => <TableRow key={line.id} line={line} />)
    return (
        <View testID="deposit-read-lines-table">
            <TableHeader />
            {rows}
        </View>
    )
}

function PartyLine({ party }: { party: string }) {
    if (party === NO_PARTY) return null
    return (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {party}
        </Text>
    )
}

function DescriptionLine({ description }: { description: string }) {
    if (description === '') return null
    return <Text className={CELL}>{description}</Text>
}

function LineCard({ line }: { line: ReadLine }) {
    return (
        <View testID={`deposit-read-line-${line.id}`} className={CARD}>
            <View className="flex-row items-center gap-2">
                <Text
                    className="min-w-0 flex-1 text-sm font-semibold text-foreground"
                    numberOfLines={1}
                >
                    {line.account}
                </Text>
                <Text className={`text-sm font-semibold tabular-nums ${line.tone}`}>
                    {line.amount}
                </Text>
            </View>
            <DescriptionLine description={line.description} />
            <PartyLine party={line.party} />
        </View>
    )
}

function LineCards({ lines }: { lines: ReadLine[] }) {
    const cards = lines.map(line => <LineCard key={line.id} line={line} />)
    return (
        <View testID="deposit-read-lines-cards" className="gap-3">
            {cards}
        </View>
    )
}

function LinesBody({ lines, isCards }: { lines: ReadLine[]; isCards: boolean }) {
    if (isCards) return <LineCards lines={lines} />
    return <LineTable lines={lines} />
}

interface DepositLinesReadProps {
    isVisible: boolean
    lines: readonly DepositLineRow[]
    currency: string
}

/**
 * Other funds of a posted or void deposit (bank deposit spec §3.8), drawn when it has
 * lines: a table of Received from, Account, Description and Amount at or above the read
 * table's least width (lib/deposit-columns.ts), measured on the section; one card per line
 * below it. Money out reads "−$20.00" in the danger tone.
 */
export function DepositLinesRead({ isVisible, lines, currency }: DepositLinesReadProps) {
    const { width, onLayout } = useContainerWidth()
    if (!isVisible) return null
    const isCards = width > 0 && width < depositReadLinesMinWidth
    const drawn = readLinesOf(lines, currency)
    return (
        <View className="gap-2" onLayout={onLayout}>
            <Text className={SECTION_HEADING}>Other funds</Text>
            <LinesBody lines={drawn} isCards={isCards} />
        </View>
    )
}
