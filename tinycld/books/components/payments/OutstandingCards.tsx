import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import { entryCents } from '../../lib/payment-allocation'
import { SelectBox, type SelectBoxState } from '../SelectBox'
import {
    DueText,
    type GridRowProps,
    InvoiceLink,
    type OutstandingGridProps,
} from './OutstandingGrid'
import { PaymentCell } from './PaymentCell'

// A label over its value, a half of the card's money pair.
export function CardPair({ label, value }: { label: string; value: string }) {
    return (
        <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className="text-sm text-foreground tabular-nums">{value}</Text>
        </View>
    )
}

export const CARD = 'gap-2 rounded-xl border border-border bg-background p-3'

function InvoiceCard({
    row,
    payments,
    error,
    isLast,
    currency,
    today,
    isDisabled,
    onTick,
    onType,
    onNext,
    onFocusRow,
    rowRef,
}: GridRowProps) {
    const entry = payments[row.id]
    const tick: SelectBoxState = entryCents(entry, currency) > 0 ? 'checked' : 'empty'
    const handleTick = () => onTick(row)
    const label = `Invoice ${row.number}`
    const original = formatMoney(row.total, currency)
    const open = formatMoney(row.open, currency)
    const value = entry?.amount ?? ''
    const cellRef = rowRef(row.id)
    return (
        <View testID={`payment-card-${row.id}`} className={CARD}>
            <View className="flex-row items-center gap-1">
                <SelectBox
                    state={tick}
                    label={`Pay invoice ${row.number}`}
                    testID={`payment-row-tick-${row.id}`}
                    onPress={handleTick}
                    isDisabled={isDisabled}
                    tabIndex={-1}
                />
                <View className="min-w-0 flex-1">
                    <InvoiceLink
                        invoiceId={row.id}
                        label={label}
                        testID={`payment-row-link-${row.id}`}
                    />
                </View>
            </View>
            <DueText dueDate={row.due_date} today={today} />
            <View className="flex-row gap-3">
                <CardPair label="Original" value={original} />
                <CardPair label="Open balance" value={open} />
            </View>
            <PaymentCell
                row={row}
                value={value}
                error={error}
                isLast={isLast}
                isDisabled={isDisabled}
                inputRef={cellRef}
                onType={onType}
                onNext={onNext}
                onFocusRow={onFocusRow}
            />
        </View>
    )
}

/**
 * The outstanding list below 640 px (spec §3.3): one card per invoice, with the tick box
 * and "Invoice 1004" on the first line, the due date, Original and Open balance as a
 * label-value pair, and the Payment input at full width. The tick box is a press target
 * only; the card's one Tab stop is its Payment input.
 */
export function OutstandingCards(props: OutstandingGridProps) {
    const { rows, rowErrors } = props
    const lastId = rows[rows.length - 1]?.id
    const drawn = rows.map(row => (
        <InvoiceCard
            key={row.id}
            {...props}
            row={row}
            error={rowErrors[row.id] ?? ''}
            isLast={row.id === lastId}
        />
    ))
    return <View className="gap-3">{drawn}</View>
}
