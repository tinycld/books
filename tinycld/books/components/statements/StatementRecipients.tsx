import { EmptyState } from '@tinycld/core/components/EmptyState'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { iosInputCenteringStyle } from '@tinycld/core/ui/form/ios-input-style'
import type { Ref } from 'react'
import { TextInput as RNTextInput, Text, View } from 'react-native'
import { useFitsTable } from '../../hooks/useFitsTable'
import { formatMoney } from '../../lib/money'
import {
    RECIPIENT_CELL_GAP,
    RECIPIENT_COLUMNS,
    RECIPIENT_ROW_PADDING,
    RECIPIENT_TABLE_MIN_WIDTH,
} from '../../lib/statement-columns'
import { type RecipientRow, recipientLabel } from '../../lib/statement-recipients'
import { emptyRecipientsText, type StatementBalanceFilter } from '../../lib/statement-texts'
import { ListBanner } from '../ListBanner'
import { ListCards } from '../ListCards'
import { ListHeaderRow, type ListScrollHandle, ListTable } from '../ListTable'
import { FieldError } from '../payments/PaymentMoneyField'
import { SelectBox, type SelectBoxState } from '../SelectBox'

const TAP = { minHeight: 44 }
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const INPUT_STYLE = iosInputCenteringStyle(16)
// A row holds the 44 px tick box and the address field; a card holds the tick line, the
// address field and the space under it. An address error makes its row taller.
const ROW_HEIGHT = 56
const CARD_HEIGHT = 136
const ROW_STYLE = {
    minHeight: ROW_HEIGHT,
    gap: RECIPIENT_CELL_GAP,
    paddingHorizontal: RECIPIENT_ROW_PADDING,
}
const HEADER_STYLE = { gap: RECIPIENT_CELL_GAP, paddingHorizontal: RECIPIENT_ROW_PADDING }

// One listed customer: its row, its tick and the run's address (the user's choice or the
// default), and the address's error ('' for none).
export type RecipientEntry = {
    row: RecipientRow
    isTicked: boolean
    email: string
    error: string
}

export type RecipientsListState = 'loading' | 'error' | 'empty' | 'list'

interface RecipientPartProps {
    entry: RecipientEntry
    currency: string
    isDisabled: boolean
    onToggle(customer: string): void
    onEmailChange(customer: string, email: string): void
}

function tickOf(isTicked: boolean): SelectBoxState {
    return isTicked ? 'checked' : 'empty'
}

function keyOfEntry(entry: RecipientEntry): string {
    return entry.row.customer
}

function cardHeightOf(): number {
    return CARD_HEIGHT
}

// The parent's name (muted) before the customer's, and " (inactive)" after it.
function RecipientName({ row, lines }: { row: RecipientRow; lines: number }) {
    const parent = row.parentName === '' ? '' : `${row.parentName}:`
    const suffix = row.inactive ? ' (inactive)' : ''
    return (
        <Text className="text-sm text-foreground" numberOfLines={lines}>
            <Text className="text-muted-foreground">{parent}</Text>
            {row.name}
            {suffix}
        </Text>
    )
}

/**
 * The address of this run's statement, with its error under it. It draws core TextInput's
 * input (the same classes and the themed placeholder colour) but is controlled by value:
 * a customer the user has not touched has no entry in the form (its address is the
 * customer's own), so there is no form path to bind until the first change, which goes
 * through the screen's choice handler (as PaymentMoneyField does for a row's payment).
 */
function EmailField({
    entry,
    isDisabled,
    onEmailChange,
}: Pick<RecipientPartProps, 'entry' | 'isDisabled' | 'onEmailChange'>) {
    const { row, email, error } = entry
    const placeholderColor = useThemeColor('field-placeholder')
    const border = error ? 'border-danger' : 'border-border'
    const change = (text: string) => onEmailChange(row.customer, text)
    return (
        <View className="min-w-0">
            <RNTextInput
                testID={`statements-email-${row.customer}`}
                accessibilityLabel={`Email address, ${recipientLabel(row)}`}
                value={email}
                onChangeText={change}
                editable={!isDisabled}
                aria-disabled={isDisabled}
                inputMode="email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={placeholderColor}
                className={`min-w-0 rounded-lg border bg-background px-3 py-2.5 text-base text-foreground ${border}`}
                style={INPUT_STYLE}
            />
            <FieldError message={error} testID={`statements-address-error-${row.customer}`} />
        </View>
    )
}

function RecipientTick({
    entry,
    isDisabled,
    onToggle,
}: Pick<RecipientPartProps, 'entry' | 'isDisabled' | 'onToggle'>) {
    const { row, isTicked } = entry
    const toggle = () => onToggle(row.customer)
    return (
        <SelectBox
            state={tickOf(isTicked)}
            label={`Select ${recipientLabel(row)}`}
            testID={`statements-tick-${row.customer}`}
            onPress={toggle}
            isDisabled={isDisabled}
        />
    )
}

function RecipientTableRow(props: RecipientPartProps) {
    const { entry, currency } = props
    const { row } = entry
    const balance = formatMoney(row.balance, currency)
    return (
        <View
            testID={`statements-row-${row.customer}`}
            className="flex-row items-start border-b border-border py-1"
            style={ROW_STYLE}
        >
            <View style={RECIPIENT_COLUMNS.tick}>
                <RecipientTick {...props} />
            </View>
            <View className="min-w-0 justify-center" style={[RECIPIENT_COLUMNS.name, TAP]}>
                <RecipientName row={row} lines={1} />
            </View>
            <View className="min-w-0" style={RECIPIENT_COLUMNS.email}>
                <EmailField {...props} />
            </View>
            <View className="justify-center" style={[RECIPIENT_COLUMNS.balance, TAP]}>
                <Text className="text-right text-sm text-foreground tabular-nums">{balance}</Text>
            </View>
        </View>
    )
}

// First line: the tick box and the name, the balance at the right; second: the address.
function RecipientCard(props: RecipientPartProps & { height: number }) {
    const { entry, currency, height } = props
    const { row } = entry
    const frame = { minHeight: height }
    const balance = formatMoney(row.balance, currency)
    return (
        <View className="pb-3" style={frame}>
            <View
                testID={`statements-card-${row.customer}`}
                className="gap-2 rounded-xl border border-border bg-background p-3"
            >
                <View
                    testID={`statements-row-${row.customer}`}
                    className="flex-row items-center gap-1"
                >
                    <RecipientTick {...props} />
                    <View className="min-w-0 flex-1">
                        <RecipientName row={row} lines={2} />
                    </View>
                    <Text className="text-sm font-medium text-foreground tabular-nums">
                        {balance}
                    </Text>
                </View>
                <EmailField {...props} />
            </View>
        </View>
    )
}

interface RecipientListProps {
    entries: readonly RecipientEntry[]
    currency: string
    isDisabled: boolean
    tickAll: SelectBoxState
    scrollToIndex: number | undefined
    // Save and send's refusal scrolls its first row into view through it.
    scrollHandle: Ref<ListScrollHandle>
    onToggle(customer: string): void
    onToggleAll(): void
    onEmailChange(customer: string, email: string): void
}

const noMoreRows = () => {}

function RecipientTable(props: RecipientListProps & { onGutter(gutter: number): void }) {
    const { entries, tickAll, isDisabled, onToggleAll, scrollToIndex, scrollHandle, onGutter } =
        props
    const renderRow = (entry: RecipientEntry) => <RecipientTableRow {...props} entry={entry} />
    const header = (
        <ListHeaderRow testID="statements-table-header" rowClass="flex-row items-center">
            <View className="flex-1 flex-row items-center py-1" style={HEADER_STYLE}>
                <View style={RECIPIENT_COLUMNS.tick}>
                    <SelectBox
                        state={tickAll}
                        label="Select all customers"
                        testID="statements-tick-all"
                        onPress={onToggleAll}
                        isDisabled={isDisabled}
                    />
                </View>
                <Text className={HEAD} style={RECIPIENT_COLUMNS.name} numberOfLines={1}>
                    Recipient
                </Text>
                <Text className={HEAD} style={RECIPIENT_COLUMNS.email} numberOfLines={1}>
                    Email address
                </Text>
                <Text
                    className={`${HEAD} text-right`}
                    style={RECIPIENT_COLUMNS.balance}
                    numberOfLines={1}
                >
                    Balance
                </Text>
            </View>
        </ListHeaderRow>
    )
    return (
        <ListTable
            testID="statements-table"
            minWidth={RECIPIENT_TABLE_MIN_WIDTH}
            rowHeight={ROW_HEIGHT}
            header={header}
            rows={entries}
            keyOf={keyOfEntry}
            renderRow={renderRow}
            onNearEnd={noMoreRows}
            scrollToIndex={scrollToIndex}
            scrollHandle={scrollHandle}
            onGutter={onGutter}
        />
    )
}

// The cards' touch path to the heading tick box: a "Select all" row over the cards
// (lesson 28).
function RecipientCards(props: RecipientListProps) {
    const { entries, tickAll, isDisabled, onToggleAll, scrollToIndex, scrollHandle } = props
    const renderCard = (entry: RecipientEntry, height: number) => (
        <RecipientCard {...props} entry={entry} height={height} />
    )
    return (
        <View className="flex-1 gap-3">
            <SelectBox
                state={tickAll}
                label="Select all customers"
                text="Select all"
                testID="statements-tick-all"
                onPress={onToggleAll}
                isDisabled={isDisabled}
            />
            <ListCards
                testID="statements-cards"
                rows={entries}
                heightOf={cardHeightOf}
                keyOf={keyOfEntry}
                renderCard={renderCard}
                onNearEnd={noMoreRows}
                scrollToIndex={scrollToIndex}
                scrollHandle={scrollHandle}
            />
        </View>
    )
}

const SKELETON_ROWS = [0, 1, 2, 3]

function SkeletonBar({ className }: { className: string }) {
    return <View className={`rounded bg-muted ${className}`} />
}

function RecipientSkeleton() {
    const rows = SKELETON_ROWS.map(index => (
        <View key={index} className="flex-row items-center gap-3 border-b border-border py-3">
            <SkeletonBar className="h-5 w-5" />
            <SkeletonBar className="h-4 flex-1" />
            <SkeletonBar className="h-9 flex-1" />
            <SkeletonBar className="h-4 w-24" />
        </View>
    ))
    return (
        <View testID="statements-loading" accessibilityLabel="Loading customers">
            {rows}
        </View>
    )
}

// No customer matches Customer balance: the message through core EmptyState, and the way
// out as a line under it (core EmptyState holds one message).
function RecipientsEmpty({ filter }: { filter: StatementBalanceFilter }) {
    const text = emptyRecipientsText(filter)
    return (
        <View testID="statements-empty" className="items-center py-6">
            <EmptyState message={text.title} />
            <Text className="text-sm text-muted-foreground">{text.detail}</Text>
        </View>
    )
}

interface StatementRecipientsProps extends RecipientListProps {
    state: RecipientsListState
    filter: StatementBalanceFilter
    onRetry(): void
}

/**
 * The list area of Create statements (spec §3.3, §3.10): row skeletons while the
 * customers load, the load error with Retry, the empty state, or the listed customers as
 * a windowed table (the list's own width at least the table's minimum plus the scrollbar
 * gutter) or windowed cards with a "Select all" row (below it). It never scrolls sideways.
 */
export function StatementRecipients(props: StatementRecipientsProps) {
    const fits = useFitsTable(RECIPIENT_TABLE_MIN_WIDTH)
    const body = recipientsBody(props, fits)
    return (
        <View testID="statements-recipients" className="min-h-0 flex-1" onLayout={fits.onLayout}>
            {body}
        </View>
    )
}

function recipientsBody(props: StatementRecipientsProps, fits: ReturnType<typeof useFitsTable>) {
    if (props.state === 'loading') return <RecipientSkeleton />
    if (props.state === 'error') {
        return (
            <ListBanner
                testIdPrefix="statements"
                message="Customers could not load."
                onRetry={props.onRetry}
                isFlush
            />
        )
    }
    if (props.state === 'empty') return <RecipientsEmpty filter={props.filter} />
    if (fits.showCards) return <RecipientCards {...props} />
    return <RecipientTable {...props} onGutter={fits.onGutter} />
}
