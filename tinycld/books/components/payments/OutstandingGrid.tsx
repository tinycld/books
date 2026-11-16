import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, type TextInputInstance, View } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { formatMoney } from '../../lib/money'
import { entryCents, type OutstandingRow, type Payments } from '../../lib/payment-allocation'
import { PAYMENT_COLUMNS, PAYMENT_GRID_MIN_WIDTH } from '../../lib/payment-columns'
import { formatDay } from '../../lib/register-range'
import { INVOICE_KIND } from '../../lib/sales-document-kinds'
import { SelectBox, type SelectBoxState } from '../SelectBox'
import { PaymentCell } from './PaymentCell'

const TAP = { minHeight: 44 }
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const MONEY_CELL = 'text-right text-sm text-foreground tabular-nums'
const COL = {
    tick: { width: PAYMENT_COLUMNS.tick },
    invoice: PAYMENT_COLUMNS.invoice,
    dueDate: { width: PAYMENT_COLUMNS.dueDate },
    original: { width: PAYMENT_COLUMNS.original },
    open: { width: PAYMENT_COLUMNS.open },
    payment: { width: PAYMENT_COLUMNS.payment },
} as const

export interface OutstandingGridProps {
    // The drawn rows: the listed rows the find filter keeps.
    rows: OutstandingRow[]
    // The header tick box's state over every listed row (`tickAllState`).
    tickAll: SelectBoxState
    payments: Payments
    // A row's message under its Payment cell, by invoice id.
    rowErrors: Readonly<Record<string, string>>
    currency: string
    today: string
    // A save runs: the tick boxes and the cells wait for it.
    isDisabled: boolean
    onTick: (row: OutstandingRow) => void
    onTickAll: () => void
    onType: (row: OutstandingRow, text: string) => void
    onNext: (rowId: string) => void
    onFocusRow: (rowId: string | null) => void
    rowRef: (rowId: string) => (node: TextInputInstance | null) => void
}

export function invoiceLabel(row: { number: string; date: string }): string {
    return `Invoice ${row.number} · ${formatDay(row.date)}`
}

interface InvoiceLinkProps {
    invoiceId: string
    label: string
    testID: string
}

// Opens the invoice (pushed), so Back returns to the form with its edits. A press target
// only: the row's one Tab stop is its cell.
export function InvoiceLink({ invoiceId, label, testID }: InvoiceLinkProps) {
    const orgHref = useOrgHref()
    const open = () => router.push(orgHref(`books/invoices/${invoiceId}`))
    return <InvoiceLinkText label={label} testID={testID} onPress={open} />
}

// The read view's link to an applied invoice: back to the invoice's screen when it is
// below the payment (the payment was received from it), so the stack keeps one copy of
// it (helix lesson 15); else pushed.
export function AppliedInvoiceLink({ invoiceId, label, testID }: InvoiceLinkProps) {
    const open = useOpenDocument(INVOICE_KIND, invoiceId)
    return <InvoiceLinkText label={label} testID={testID} onPress={open} />
}

function InvoiceLinkText({
    label,
    testID,
    onPress,
}: {
    label: string
    testID: string
    onPress: () => void
}) {
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            tabIndex={-1}
            onPress={onPress}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline" numberOfLines={1}>
                {label}
            </Text>
        </Pressable>
    )
}

export function DueText({ dueDate, today }: { dueDate: string; today: string }) {
    const isOverdue = dueDate !== '' && dueDate < today
    const tone = isOverdue ? 'text-destructive' : 'text-foreground'
    const overdue = isOverdue ? ' · Overdue' : ''
    const text = `${formatDay(dueDate)}${overdue}`
    return (
        <Text className={`text-sm ${tone}`} numberOfLines={1}>
            {text}
        </Text>
    )
}

// The header tick box over every listed row, hidden by the find filter or not, since
// pressing it pays or clears them all.
export function tickAllState(
    rows: readonly OutstandingRow[],
    payments: Payments,
    currency: string
): SelectBoxState {
    const count = rows.filter(row => entryCents(payments[row.id], currency) > 0).length
    if (count === 0) return 'empty'
    return count === rows.length ? 'checked' : 'mixed'
}

function GridHeader({
    tick,
    isDisabled,
    onTickAll,
}: {
    tick: SelectBoxState
    isDisabled: boolean
    onTickAll: () => void
}) {
    return (
        <View className="flex-row items-center gap-3 border-b border-border px-2 py-1">
            <View style={COL.tick}>
                <SelectBox
                    state={tick}
                    label="Pay every listed invoice"
                    testID="payment-tick-all"
                    onPress={onTickAll}
                    isDisabled={isDisabled}
                    tabIndex={-1}
                />
            </View>
            <Text className={HEAD} style={COL.invoice}>
                Invoice
            </Text>
            <Text className={HEAD} style={COL.dueDate}>
                Due date
            </Text>
            <Text className={`${HEAD} text-right`} style={COL.original}>
                Original amount
            </Text>
            <Text className={`${HEAD} text-right`} style={COL.open}>
                Open balance
            </Text>
            <Text className={`${HEAD} text-right`} style={COL.payment}>
                Payment
            </Text>
        </View>
    )
}

export interface GridRowProps
    extends Omit<OutstandingGridProps, 'rows' | 'tickAll' | 'onTickAll' | 'rowErrors'> {
    row: OutstandingRow
    error: string
    isLast: boolean
}

function GridRow({
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
    const label = invoiceLabel(row)
    const original = formatMoney(row.total, currency)
    const open = formatMoney(row.open, currency)
    const value = entry?.amount ?? ''
    const cellRef = rowRef(row.id)
    return (
        <View
            testID={`payment-row-${row.id}`}
            className="flex-row items-start gap-3 border-b border-border px-2 py-1"
        >
            <View style={COL.tick}>
                <SelectBox
                    state={tick}
                    label={`Pay invoice ${row.number}`}
                    testID={`payment-row-tick-${row.id}`}
                    onPress={handleTick}
                    isDisabled={isDisabled}
                    tabIndex={-1}
                />
            </View>
            <View style={COL.invoice}>
                <InvoiceLink
                    invoiceId={row.id}
                    label={label}
                    testID={`payment-row-link-${row.id}`}
                />
            </View>
            <View className="justify-center" style={[COL.dueDate, TAP]}>
                <DueText dueDate={row.due_date} today={today} />
            </View>
            <View className="justify-center" style={[COL.original, TAP]}>
                <Text className={MONEY_CELL}>{original}</Text>
            </View>
            <View className="justify-center" style={[COL.open, TAP]}>
                <Text className={MONEY_CELL}>{open}</Text>
            </View>
            <View style={COL.payment}>
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
        </View>
    )
}

/**
 * The wide outstanding list: a header tick box (pays every row, or clears them all when
 * every row is paid: usePaymentForm `onTickAll`) and the columns Invoice, Due date,
 * Original amount, Open balance and Payment, sharing the column widths with the header
 * inside the sideways scroller.
 */
export function OutstandingGrid(props: OutstandingGridProps) {
    const { rows, rowErrors, tickAll, isDisabled, onTickAll } = props
    // The rows sit in the page's scroller, not a scroller of their own, so the gutter the
    // hook measures stays 0 and only the content width is used.
    const { contentStyle } = useTableMinWidth(PAYMENT_GRID_MIN_WIDTH)
    const lastId = rows[rows.length - 1]?.id
    const drawn = rows.map(row => (
        <GridRow
            key={row.id}
            {...props}
            row={row}
            error={rowErrors[row.id] ?? ''}
            isLast={row.id === lastId}
        />
    ))
    return (
        <ScrollView horizontal contentContainerStyle={contentStyle}>
            <View style={{ flex: 1 }}>
                <GridHeader tick={tickAll} isDisabled={isDisabled} onTickAll={onTickAll} />
                {drawn}
            </View>
        </ScrollView>
    )
}
