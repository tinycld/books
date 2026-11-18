import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router } from 'expo-router'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import {
    Pressable,
    type StyleProp,
    Text,
    type TextInputInstance,
    View,
    type ViewStyle,
} from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { formatMoney } from '../../lib/money'
import {
    gridDocumentLabel,
    INVOICE_OUTSTANDING,
    type OutstandingDocument,
    type OutstandingSort,
    type OutstandingSortColumn,
    outstandingTexts,
    partyHeader,
    refText,
    rowTickLabel,
    totalTexts,
} from '../../lib/outstanding-documents'
import { entryCents, type OutstandingRow, type Payments } from '../../lib/payment-allocation'
import { formatDay } from '../../lib/register-range'
import { SelectBox, type SelectBoxState } from '../SelectBox'
import { PaymentCell } from './PaymentCell'

const TAP = { minHeight: 44 }
// A link never grows past its cell: a long label ellipsizes inside the column.
const LINK = { ...TAP, maxWidth: '100%' } as const
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const MONEY_CELL = 'text-right text-sm text-foreground tabular-nums'
const ARROW_SIZE = 12

// The cell styles of one descriptor's widths, shared by the header, the rows and the
// totals row, so a column lines up from the header down. Every data column grows with the
// grid from its least width; the tick column is fixed.
function columnStyles(doc: OutstandingDocument) {
    const { columns } = doc
    return {
        tick: { width: columns.tick },
        party: columns.party ?? { width: 0 },
        document: columns.document,
        dueDate: columns.dueDate,
        open: columns.open,
        payment: columns.payment,
    }
}

type ColumnStyles = ReturnType<typeof columnStyles>

export interface OutstandingGridProps {
    // Which documents the rows are (invoices or bills): texts, links, test ids, widths.
    doc: OutstandingDocument
    // The drawn rows: the listed rows the filters keep.
    rows: OutstandingRow[]
    // The header tick box's state over the rows it pays (`tickAllState`).
    tickAll: SelectBoxState
    payments: Payments
    // A row's message under its Payment cell, by document id.
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
    // The sorted column: with `onSort`, the Vendor and Due date headers sort the rows.
    sort?: OutstandingSort
    onSort?: (column: OutstandingSortColumn) => void
    // A totals row under the rows: Open balance of the shown rows, Payment of every row
    // with a payment. null or absent draws none.
    totals?: { open: number; payment: number } | null
}

export function invoiceLabel(row: { number: string; date: string }): string {
    return gridDocumentLabel(INVOICE_OUTSTANDING, row)
}

interface DocumentLinkProps {
    routeBase: string
    documentId: string
    label: string
    testID: string
}

// Opens the invoice or bill (pushed), so Back returns to the form with its edits. A press
// target only: the row's one Tab stop is its cell.
export function DocumentLink({ routeBase, documentId, label, testID }: DocumentLinkProps) {
    const orgHref = useOrgHref()
    const open = () => router.push(orgHref(`${routeBase}/${documentId}`))
    return <DocumentLinkText label={label} testID={testID} onPress={open} />
}

interface AppliedDocumentLinkProps {
    doc: OutstandingDocument
    documentId: string
    label: string
    testID: string
}

// The read view's link to a paid invoice or bill: back to its screen when it is below the
// payment (the payment was made from it), so the stack keeps one copy of it (helix lesson
// 15); else pushed.
export function AppliedDocumentLink({ doc, documentId, label, testID }: AppliedDocumentLinkProps) {
    const open = useOpenDocument(doc.openKind, documentId)
    return <DocumentLinkText label={label} testID={testID} onPress={open} />
}

function DocumentLinkText({
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
            style={LINK}
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

// The header tick box over the rows it pays (every listed invoice; every shown bill),
// since pressing it pays or clears them all.
export function tickAllState(
    rows: readonly OutstandingRow[],
    payments: Payments,
    currency: string
): SelectBoxState {
    const count = rows.filter(row => entryCents(payments[row.id], currency) > 0).length
    if (count === 0) return 'empty'
    return count === rows.length ? 'checked' : 'mixed'
}

function SortArrow({ isVisible, descending }: { isVisible: boolean; descending: boolean }) {
    const muted = useThemeColor('muted-foreground')
    if (!isVisible) return null
    const Arrow = descending ? ArrowDown : ArrowUp
    return <Arrow size={ARROW_SIZE} color={muted} />
}

interface HeaderLabelProps {
    label: string
    style: StyleProp<ViewStyle>
    // The column this header sorts by; undefined for a header that does not sort.
    column?: OutstandingSortColumn
    sort?: OutstandingSort
    onSort?: (column: OutstandingSortColumn) => void
    testID?: string
}

// A column header: plain text, or with `onSort` a press target (not a Tab stop: the
// list's keys are its cells) whose arrow marks the sorted column.
function HeaderLabel({ label, style, column, sort, onSort, testID }: HeaderLabelProps) {
    if (!column || !onSort) {
        return (
            <Text className={HEAD} style={style}>
                {label}
            </Text>
        )
    }
    const isSorted = sort?.column === column
    const descending = sort?.descending ?? false
    const handlePress = () => onSort(column)
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${label}`}
            tabIndex={-1}
            onPress={handlePress}
            className="flex-row items-center gap-1"
            style={[style, TAP]}
        >
            <Text className={HEAD}>{label}</Text>
            <SortArrow isVisible={isSorted} descending={descending} />
        </Pressable>
    )
}

function PartyHeader({
    doc,
    col,
    sort,
    onSort,
}: {
    doc: OutstandingDocument
    col: ColumnStyles
    sort?: OutstandingSort
    onSort?: (column: OutstandingSortColumn) => void
}) {
    if (doc.party === 'none') return null
    return (
        <HeaderLabel
            label={partyHeader(doc)}
            style={col.party}
            column="vendor"
            sort={sort}
            onSort={onSort}
            testID={`${doc.testIdPrefix}-sort-vendor`}
        />
    )
}

// The header's tick box, where the descriptor pays every row from it; else the tick
// column's space, so the headers line up with the rows.
function HeaderTick({
    doc,
    tick,
    isDisabled,
    onTickAll,
}: {
    doc: OutstandingDocument
    tick: SelectBoxState
    isDisabled: boolean
    onTickAll: () => void
}) {
    const style = { width: doc.columns.tick }
    const label = outstandingTexts(doc).payAllLabel
    if (!doc.hasPayAll || label === null) return <View style={style} />
    return (
        <View style={style}>
            <SelectBox
                state={tick}
                label={label}
                testID={`${doc.testIdPrefix}-tick-all`}
                onPress={onTickAll}
                isDisabled={isDisabled}
                tabIndex={-1}
            />
        </View>
    )
}

// The total column's header; nothing where the descriptor has no total column.
function TotalHeader({ doc }: { doc: OutstandingDocument }) {
    const { original } = doc.columns
    if (original === null) return null
    return (
        <Text className={`${HEAD} text-right`} style={original}>
            {totalTexts(doc).header}
        </Text>
    )
}

function GridHeader({
    doc,
    tick,
    isDisabled,
    onTickAll,
    sort,
    onSort,
}: {
    doc: OutstandingDocument
    tick: SelectBoxState
    isDisabled: boolean
    onTickAll: () => void
    sort?: OutstandingSort
    onSort?: (column: OutstandingSortColumn) => void
}) {
    const col = columnStyles(doc)
    const prefix = doc.testIdPrefix
    return (
        <View className="flex-row items-center gap-3 border-b border-border px-2 py-1">
            <HeaderTick doc={doc} tick={tick} isDisabled={isDisabled} onTickAll={onTickAll} />
            <PartyHeader doc={doc} col={col} sort={sort} onSort={onSort} />
            <HeaderLabel label={doc.noun} style={col.document} />
            <HeaderLabel
                label="Due date"
                style={col.dueDate}
                column="due"
                sort={sort}
                onSort={onSort}
                testID={`${prefix}-sort-due`}
            />
            <TotalHeader doc={doc} />
            <Text className={`${HEAD} text-right`} style={col.open}>
                Open balance
            </Text>
            <Text className={`${HEAD} text-right`} style={col.payment}>
                {doc.paymentHeader}
            </Text>
        </View>
    )
}

export interface GridRowProps
    extends Omit<
        OutstandingGridProps,
        'rows' | 'tickAll' | 'onTickAll' | 'rowErrors' | 'sort' | 'onSort' | 'totals'
    > {
    row: OutstandingRow
    error: string
    isLast: boolean
}

function PartyCell({ doc, party }: { doc: OutstandingDocument; party: string }) {
    if (doc.party === 'none') return null
    const col = columnStyles(doc)
    return (
        <View className="justify-center" style={[col.party, TAP]}>
            <Text className="text-sm text-foreground" numberOfLines={1}>
                {party}
            </Text>
        </View>
    )
}

// A row's total; nothing where the descriptor has no total column.
function TotalCell({ doc, text }: { doc: OutstandingDocument; text: string }) {
    const { original } = doc.columns
    if (original === null) return null
    return (
        <View className="justify-center" style={[original, TAP]}>
            <Text className={MONEY_CELL}>{text}</Text>
        </View>
    )
}

// The vendor's bill no. under the bill link, muted; nothing without one.
function RefLine({ text }: { text: string }) {
    if (text === '') return null
    return (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {text}
        </Text>
    )
}

function GridRow({
    doc,
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
    const col = columnStyles(doc)
    const prefix = doc.testIdPrefix
    const entry = payments[row.id]
    const tick: SelectBoxState = entryCents(entry, currency) > 0 ? 'checked' : 'empty'
    const handleTick = () => onTick(row)
    const label = gridDocumentLabel(doc, row)
    const ref = refText(row.ref)
    const original = formatMoney(row.total, currency)
    const open = formatMoney(row.open, currency)
    const tickLabel = rowTickLabel(doc, row.number)
    const value = entry?.amount ?? ''
    const cellRef = rowRef(row.id)
    return (
        <View
            testID={`${prefix}-row-${row.id}`}
            className="flex-row items-start gap-3 border-b border-border px-2 py-1"
        >
            <View style={col.tick}>
                <SelectBox
                    state={tick}
                    label={tickLabel}
                    testID={`${prefix}-row-tick-${row.id}`}
                    onPress={handleTick}
                    isDisabled={isDisabled}
                    tabIndex={-1}
                />
            </View>
            <PartyCell doc={doc} party={row.party ?? ''} />
            <View style={col.document}>
                <DocumentLink
                    routeBase={doc.openKind.routeBase}
                    documentId={row.id}
                    label={label}
                    testID={`${prefix}-row-link-${row.id}`}
                />
                <RefLine text={ref} />
            </View>
            <View className="justify-center" style={[col.dueDate, TAP]}>
                <DueText dueDate={row.due_date} today={today} />
            </View>
            <TotalCell doc={doc} text={original} />
            <View className="justify-center" style={[col.open, TAP]}>
                <Text className={MONEY_CELL}>{open}</Text>
            </View>
            <View style={col.payment}>
                <PaymentCell
                    doc={doc}
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

function PartySpacer({ doc }: { doc: OutstandingDocument }) {
    if (doc.party === 'none') return null
    return <View style={columnStyles(doc).party} />
}

function TotalSpacer({ doc }: { doc: OutstandingDocument }) {
    const { original } = doc.columns
    if (original === null) return null
    return <View style={original} />
}

function GridTotals({
    doc,
    totals,
    currency,
}: {
    doc: OutstandingDocument
    totals: { open: number; payment: number } | null | undefined
    currency: string
}) {
    if (!totals) return null
    const col = columnStyles(doc)
    const open = formatMoney(totals.open, currency)
    const payment = formatMoney(totals.payment, currency)
    return (
        <View
            testID={`${doc.testIdPrefix}-grid-totals`}
            className="flex-row items-center gap-3 px-2 py-2"
        >
            <View style={col.tick} />
            <PartySpacer doc={doc} />
            <Text className="text-sm font-semibold text-foreground" style={col.document}>
                Total
            </Text>
            <View style={col.dueDate} />
            <TotalSpacer doc={doc} />
            <Text className={`${MONEY_CELL} font-semibold`} style={col.open}>
                {open}
            </Text>
            <Text className={`${MONEY_CELL} font-semibold`} style={col.payment}>
                {payment}
            </Text>
        </View>
    )
}

/**
 * The wide open-document list: a header tick box where the descriptor has Pay all (pays
 * every row, or clears them all when every row is paid), the descriptor's party column
 * (Vendor on Pay Bills), the document link, Due date, the total where the descriptor has a
 * total column, Open balance and the payment column (the descriptor's `paymentHeader`),
 * sharing the column widths with the header and the totals row. The columns grow to fill the list and never scroll sideways:
 * the list shows this grid only while it is at least `doc.gridMinWidth` wide, cards below.
 * With `onSort` the Vendor and Due date headers sort; with `totals` a totals row closes the
 * list.
 */
export function OutstandingGrid(props: OutstandingGridProps) {
    const { doc, rows, rowErrors, tickAll, isDisabled, onTickAll, sort, onSort, totals } = props
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
        <View testID={`${doc.testIdPrefix}-grid`}>
            <GridHeader
                doc={doc}
                tick={tickAll}
                isDisabled={isDisabled}
                onTickAll={onTickAll}
                sort={sort}
                onSort={onSort}
            />
            {drawn}
            <GridTotals doc={doc} totals={totals} currency={props.currency} />
        </View>
    )
}
