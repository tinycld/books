import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native'
import { useCustomerTransactions } from '../../../hooks/useCustomerTransactions'
import { documentHref } from '../../../lib/document-routes'
import { formatMoney } from '../../../lib/money'
import {
    emptyText,
    filterTestId,
    type PartyTransactionRow,
    TRANSACTION_DOC_KINDS,
    TRANSACTION_FILTERS,
    TRANSACTION_TYPE_LABELS,
    type TransactionFilter,
} from '../../../lib/party-transactions'
import { formatDay } from '../../../lib/register-range'
import { ListBanner } from '../../ListBanner'
import { ListCards } from '../../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../../ListTable'
import { StatusBadge } from '../../StatusBadge'

// Header and rows share these, so the columns line up; Status is fixed so Total and the
// badge sit at the right edge at every width.
const COLUMNS = {
    date: { flex: 1.1 },
    type: { flex: 1.2 },
    number: { flex: 1 },
    due: { flex: 1.1 },
    total: { flex: 1.1 },
    status: { width: 112 },
} satisfies Record<string, ViewStyle>

const ROW_HEIGHT = 48
const CARD_HEIGHT = 88
const TABLE_MIN_WIDTH = 640
const NO_DUE_DATE = '—'

const keyOfRow = (row: PartyTransactionRow) => row.id
const cardHeightOf = () => CARD_HEIGHT

function typeAndNumber(row: PartyTransactionRow) {
    return `${TRANSACTION_TYPE_LABELS[row.kind]} ${row.number}`
}

function dueDateText(row: PartyTransactionRow) {
    if (row.kind !== 'invoice' || row.dueDate === '') return NO_DUE_DATE
    return formatDay(row.dueDate)
}

// ── Chips ──

interface ChipProps {
    label: string
    isOn: boolean
    testID: string
    onPress: () => void
}

function Chip({ label, isOn, testID, onPress }: ChipProps) {
    const box = isOn ? 'border-primary bg-primary' : 'border-border bg-background'
    const text = isOn ? 'text-primary-foreground' : 'text-foreground'
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            // react-native-web draws `aria-pressed` from the aria prop only.
            aria-pressed={isOn}
            onPress={onPress}
            className={`justify-center rounded-full border px-3 ${box}`}
            style={{ minHeight: 36 }}
        >
            <Text className={`text-sm ${text}`}>{label}</Text>
        </Pressable>
    )
}

interface FilterChipsProps {
    filter: TransactionFilter
    onSelect: (filter: TransactionFilter) => void
    gutterClass: string
}

function FilterChips({ filter, onSelect, gutterClass }: FilterChipsProps) {
    const chips = TRANSACTION_FILTERS.map(item => {
        const select = () => onSelect(item.key)
        return (
            <Chip
                key={item.key}
                label={item.label}
                isOn={item.key === filter}
                testID={filterTestId(item.key)}
                onPress={select}
            />
        )
    })
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View className={`flex-row items-center gap-2 py-3 ${gutterClass}`}>{chips}</View>
        </ScrollView>
    )
}

// ── Rows ──

interface RowProps {
    row: PartyTransactionRow
    currency: string
    onOpen: (row: PartyTransactionRow) => void
}

function Cell({ style, text, align }: { style: ViewStyle; text: string; align?: 'right' }) {
    const alignClass = align === 'right' ? ' text-right' : ''
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text numberOfLines={1} className={`text-sm text-foreground${alignClass}`}>
                {text}
            </Text>
        </View>
    )
}

function TransactionTableRow({ row, currency, onOpen }: RowProps) {
    const open = () => onOpen(row)
    const total = formatMoney(row.total, currency)
    return (
        <Pressable
            testID={`customer-transaction-${row.id}`}
            accessibilityRole="link"
            onPress={open}
            className="flex-row items-center border-b border-border pl-4 pr-2"
            style={{ height: ROW_HEIGHT }}
        >
            <Cell style={COLUMNS.date} text={formatDay(row.date)} />
            <Cell style={COLUMNS.type} text={TRANSACTION_TYPE_LABELS[row.kind]} />
            <Cell style={COLUMNS.number} text={row.number} />
            <Cell style={COLUMNS.due} text={dueDateText(row)} />
            <Cell style={COLUMNS.total} text={total} align="right" />
            <View style={COLUMNS.status} className="min-w-0 items-start">
                <StatusBadge label={row.status.label} tone={row.status.tone} />
            </View>
        </Pressable>
    )
}

const TABLE_HEADER = (
    <ListHeaderRow testID="customer-transactions-header">
        <ListHeaderCell label="Date" style={COLUMNS.date} />
        <ListHeaderCell label="Type" style={COLUMNS.type} />
        <ListHeaderCell label="No." style={COLUMNS.number} />
        <ListHeaderCell label="Due date" style={COLUMNS.due} />
        <ListHeaderCell label="Total" style={COLUMNS.total} align="right" />
        <ListHeaderCell label="Status" style={COLUMNS.status} />
    </ListHeaderRow>
)

function TransactionCard({ row, currency, height, onOpen }: RowProps & { height: number }) {
    const open = () => onOpen(row)
    const total = formatMoney(row.total, currency)
    return (
        <Pressable
            testID={`customer-transaction-${row.id}`}
            accessibilityRole="link"
            onPress={open}
            className="justify-center gap-1 border-b border-border px-4"
            style={{ height }}
        >
            <View className="flex-row items-center justify-between gap-3">
                <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                    {typeAndNumber(row)}
                </Text>
                <Text className="text-sm font-medium text-foreground">{total}</Text>
            </View>
            <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs text-muted-foreground">{formatDay(row.date)}</Text>
                <StatusBadge label={row.status.label} tone={row.status.tone} />
            </View>
        </Pressable>
    )
}

interface TransactionsListProps {
    rows: PartyTransactionRow[]
    currency: string
    isPhone: boolean
    onOpen: (row: PartyTransactionRow) => void
    onNearEnd: () => void
}

function TransactionsList({ rows, currency, isPhone, onOpen, onNearEnd }: TransactionsListProps) {
    if (isPhone) {
        const renderCard = (row: PartyTransactionRow, height: number) => (
            <TransactionCard row={row} currency={currency} height={height} onOpen={onOpen} />
        )
        return (
            <ListCards
                testID="customer-transactions-cards"
                rows={rows}
                heightOf={cardHeightOf}
                keyOf={keyOfRow}
                renderCard={renderCard}
                onNearEnd={onNearEnd}
            />
        )
    }
    const renderRow = (row: PartyTransactionRow) => (
        <TransactionTableRow row={row} currency={currency} onOpen={onOpen} />
    )
    return (
        <ListTable
            testID="customer-transactions-table"
            minWidth={TABLE_MIN_WIDTH}
            rowHeight={ROW_HEIGHT}
            header={TABLE_HEADER}
            rows={rows}
            keyOf={keyOfRow}
            renderRow={renderRow}
            onNearEnd={onNearEnd}
        />
    )
}

// ── Empty states ──

function EmptyNewButton({
    isVisible,
    isDisabled,
    onPress,
}: {
    isVisible: boolean
    isDisabled: boolean
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Button
            testID="customer-transactions-empty-new"
            size="sm"
            isDisabled={isDisabled}
            onPress={onPress}
            style={{ minHeight: 44 }}
        >
            <ButtonText>New transaction</ButtonText>
        </Button>
    )
}

function ShowAllButton({ onPress }: { onPress: () => void }) {
    return (
        <Button
            testID="customer-transactions-show-all"
            variant="outline"
            size="sm"
            onPress={onPress}
            style={{ minHeight: 44 }}
        >
            <ButtonText>Show all</ButtonText>
        </Button>
    )
}

interface CustomerTransactionsTabProps {
    customerId: string
    canWrite: boolean
    newTransactionDisabled: boolean
    onNewTransaction: () => void
    gutterClass: string
}

type BodyProps = Omit<CustomerTransactionsTabProps, 'customerId'> & {
    filter: TransactionFilter
    showAll: () => void
    transactions: ReturnType<typeof useCustomerTransactions>
    isPhone: boolean
    onOpen: (row: PartyTransactionRow) => void
}

function TransactionsBody({
    filter,
    showAll,
    transactions,
    isPhone,
    onOpen,
    canWrite,
    newTransactionDisabled,
    onNewTransaction,
    gutterClass,
}: BodyProps) {
    const { rows, currency, isLoading, isError, retry, loadMore } = transactions
    if (isError) {
        return (
            <View className={`pt-2 ${gutterClass}`}>
                <ListBanner
                    testIdPrefix="customer-transactions"
                    message="Transactions could not load."
                    onRetry={retry}
                    isFlush
                />
            </View>
        )
    }
    if (isLoading) {
        return (
            <View testID="customer-transactions-loading" className="flex-1">
                <LoadingState />
            </View>
        )
    }
    if (rows.length === 0 && filter !== 'all') {
        return (
            <View testID="customer-transactions-no-match" className="items-center gap-4 p-8">
                <Text className="text-base font-medium text-foreground">{emptyText(filter)}</Text>
                <ShowAllButton onPress={showAll} />
            </View>
        )
    }
    if (rows.length === 0) {
        return (
            <View testID="customer-transactions-empty" className="items-center gap-4 p-8">
                <Text className="text-base font-medium text-foreground">{emptyText(filter)}</Text>
                <EmptyNewButton
                    isVisible={canWrite}
                    isDisabled={newTransactionDisabled}
                    onPress={onNewTransaction}
                />
            </View>
        )
    }
    return (
        <TransactionsList
            rows={rows}
            currency={currency}
            isPhone={isPhone}
            onOpen={onOpen}
            onNearEnd={loadMore}
        />
    )
}

/**
 * The customer page's default tab (spec §3.5): every invoice, estimate and sales receipt
 * of the customer, newest first, with type chips. A row opens its document, pushed over
 * the page, so Back returns to the page as it was. The chip is local to the tab and starts
 * at All whenever the page mounts. The empty state's New transaction opens the header's
 * menu (`onNewTransaction`), so one menu serves both buttons.
 */
export function CustomerTransactionsTab({ customerId, ...props }: CustomerTransactionsTabProps) {
    const [filter, setFilter] = useState<TransactionFilter>('all')
    const transactions = useCustomerTransactions(customerId, filter)
    const isPhone = useBreakpoint() === 'mobile'
    const orgHref = useOrgHref()
    const open = (row: PartyTransactionRow) =>
        router.push(orgHref(documentHref(TRANSACTION_DOC_KINDS[row.kind], row.id)))
    const showAll = () => setFilter('all')
    return (
        <View testID="customer-transactions" className="flex-1">
            <FilterChips filter={filter} onSelect={setFilter} gutterClass={props.gutterClass} />
            <TransactionsBody
                {...props}
                filter={filter}
                showAll={showAll}
                transactions={transactions}
                isPhone={isPhone}
                onOpen={open}
            />
        </View>
    )
}
