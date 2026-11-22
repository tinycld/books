import { Pressable, Text, View } from 'react-native'
import type { ReconcileHistoryRowData } from '../../hooks/useReconcileHistory'
import { useRowFocus } from '../../hooks/useRowFocus'
import { accountLabel } from '../../lib/account-options'
import { formatMoney } from '../../lib/money'
import { RECONCILE_TEXTS } from '../../lib/reconcile'
import {
    clearedCountText,
    HISTORY_CARD_HEIGHT,
    HISTORY_CELLS,
    HISTORY_HEADER_CLASS,
    HISTORY_ROW_CLASS,
    HISTORY_ROW_HEIGHT,
    HISTORY_TEXTS,
    type HistoryMenuItem,
    type HistorySort,
    historyMenuItems,
    reconciledByText,
    reconciledCardText,
} from '../../lib/reconcile-history'
import { formatDay } from '../../lib/register-range'
import { ListHeaderCell, ListHeaderRow, ListSortHeaderCell } from '../ListTable'
import { RecordRowMenu } from '../RecordRowMenu'

export type HistoryRowProps = {
    row: ReconcileHistoryRowData
    // The keyboard's row focus (web only, core rowFocusStyle).
    isFocused: boolean
    // The reader has the Reconciliation Report: View report is drawn.
    hasReport: boolean
    // A Books admin on the latest reconciliation of its account: Undo reconciliation is drawn.
    canUndo: boolean
    // An undo is sent or the server takes no writes: Undo reconciliation is disabled.
    isUndoDisabled: boolean
    // Why it is disabled while the server takes no writes (core's reason); else undefined.
    undoHint: string | undefined
    onOpen: (id: string) => void
    onOpenReport: (id: string) => void
    onUndo: (id: string) => void
}

const ROW_MENU_LABELS: Record<HistoryMenuItem, string> = {
    report: HISTORY_TEXTS.viewReport,
    undo: HISTORY_TEXTS.undo,
}
const UNDO_WRITES: ReadonlySet<string> = new Set(['undo'])
// Undo reconciliation is red in both menus (the ledger's settled difference 7).
const UNDO_DESTRUCTIVE: ReadonlySet<string> = new Set(['undo'])
const TABLE_MENU_ITEMS: readonly HistoryMenuItem[] = ['undo']
const MENU_SPACER = { width: 44 }

function rowMenuIds(id: string): Record<HistoryMenuItem, string> {
    return {
        report: `reconcile-history-menu-report-${id}`,
        undo: `reconcile-history-undo-${id}`,
    }
}

// The texts a row and a card show. The ending balance is the stamped statement balance,
// already in the account's own sense.
function rowTexts(row: ReconcileHistoryRowData) {
    const currency = row.currency || row.accountRow.currency || 'USD'
    return {
        day: formatDay(row.statement_date),
        account: accountLabel(row.accountRow),
        balance: formatMoney(row.statement_balance, currency),
        cleared: clearedCountText(row),
        reconciledBy: reconciledByText(row),
        reconciledCard: reconciledCardText(row),
    }
}

function ReportLink({
    row,
    hasReport,
    onOpenReport,
}: Pick<HistoryRowProps, 'row' | 'hasReport' | 'onOpenReport'>) {
    if (!hasReport) return null
    const press = () => onOpenReport(row.id)
    return (
        <Text
            testID={`reconcile-history-report-${row.id}`}
            accessibilityRole="link"
            onPress={press}
            numberOfLines={1}
            className="text-sm text-primary"
        >
            {HISTORY_TEXTS.viewReport}
        </Text>
    )
}

// The table row's More menu, with only Undo reconciliation; with no Undo the 44 px place
// stays empty.
function TableRowMenu({
    row,
    canUndo,
    isUndoDisabled,
    undoHint,
    onUndo,
}: Pick<HistoryRowProps, 'row' | 'canUndo' | 'isUndoDisabled' | 'undoHint' | 'onUndo'>) {
    if (!canUndo) return <View style={MENU_SPACER} />
    const onSelect = () => onUndo(row.id)
    return (
        <RecordRowMenu
            title={RECONCILE_TEXTS.menuTitle}
            triggerTestId={`reconcile-history-more-${row.id}`}
            triggerLabel={RECONCILE_TEXTS.more}
            items={TABLE_MENU_ITEMS}
            labels={ROW_MENU_LABELS}
            testIds={rowMenuIds(row.id)}
            onSelect={onSelect}
            isWriting={isUndoDisabled}
            writes={UNDO_WRITES}
            destructive={UNDO_DESTRUCTIVE}
            writeHint={undoHint}
        />
    )
}

// One finished reconciliation of the wide table. The row's own press opens the finished
// summary; the action cell (View report and the 44 px menu place) is its sibling, so a
// press on the link or the menu does not open the summary.
export function ReconcileHistoryRow({
    row,
    isFocused,
    hasReport,
    canUndo,
    isUndoDisabled,
    undoHint,
    onOpen,
    onOpenReport,
    onUndo,
}: HistoryRowProps) {
    const focus = useRowFocus(isFocused)
    const rowStyle = { height: HISTORY_ROW_HEIGHT }
    const pressStyle = [rowStyle, focus.style]
    const press = () => onOpen(row.id)
    const texts = rowTexts(row)
    return (
        <View className={HISTORY_ROW_CLASS} style={rowStyle}>
            <Pressable
                testID={`reconcile-history-row-${row.id}`}
                accessibilityRole="button"
                onPress={press}
                className="min-w-0 flex-1 flex-row items-center"
                style={pressStyle}
                dataSet={focus.dataSet}
            >
                <View className="min-w-0 pr-3" style={HISTORY_CELLS.date}>
                    <Text numberOfLines={1} className="text-sm text-foreground">
                        {texts.day}
                    </Text>
                </View>
                <View className="min-w-0 pr-3" style={HISTORY_CELLS.account}>
                    <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                        {texts.account}
                    </Text>
                </View>
                <View className="min-w-0 pr-3" style={HISTORY_CELLS.balance}>
                    <Text
                        numberOfLines={1}
                        className="text-right text-sm tabular-nums text-foreground"
                    >
                        {texts.balance}
                    </Text>
                </View>
                <View className="min-w-0 pr-3" style={HISTORY_CELLS.cleared}>
                    <Text numberOfLines={1} className="text-sm text-foreground">
                        {texts.cleared}
                    </Text>
                </View>
                <View className="min-w-0 pr-3" style={HISTORY_CELLS.reconciled}>
                    <Text numberOfLines={1} className="text-sm text-muted-foreground">
                        {texts.reconciledBy}
                    </Text>
                </View>
            </Pressable>
            <View className="flex-row items-center justify-end gap-1" style={HISTORY_CELLS.action}>
                <ReportLink row={row} hasReport={hasReport} onOpenReport={onOpenReport} />
                <TableRowMenu
                    row={row}
                    canUndo={canUndo}
                    isUndoDisabled={isUndoDisabled}
                    undoHint={undoHint}
                    onUndo={onUndo}
                />
            </View>
        </View>
    )
}

// The card's More menu, a sibling of the card's press, so a press on it or one of its items
// does not open the summary. View report is offered only while the reader has the report,
// Undo reconciliation by the table's rule (`canUndo`); with no item the menu's place stays
// empty.
function CardMenu({
    row,
    hasReport,
    canUndo,
    isUndoDisabled,
    undoHint,
    onOpenReport,
    onUndo,
}: Omit<HistoryRowProps, 'isFocused' | 'onOpen'>) {
    const items = historyMenuItems(row, canUndo).filter(item => item !== 'report' || hasReport)
    if (items.length === 0) return <View style={MENU_SPACER} />
    const onSelect = (item: HistoryMenuItem) => {
        if (item === 'report') onOpenReport(row.id)
        if (item === 'undo') onUndo(row.id)
    }
    return (
        <RecordRowMenu
            title={RECONCILE_TEXTS.menuTitle}
            triggerTestId={`reconcile-history-more-${row.id}`}
            triggerLabel={RECONCILE_TEXTS.more}
            items={items}
            labels={ROW_MENU_LABELS}
            testIds={rowMenuIds(row.id)}
            onSelect={onSelect}
            isWriting={isUndoDisabled}
            writes={UNDO_WRITES}
            destructive={UNDO_DESTRUCTIVE}
            writeHint={undoHint}
        />
    )
}

// One finished reconciliation below the table's minimum width: the statement day and the
// ending balance; the account and the cleared count; "Reconciled <day> by <name>".
export function ReconcileHistoryCard({
    row,
    isFocused,
    hasReport,
    canUndo,
    isUndoDisabled,
    undoHint,
    onOpen,
    onOpenReport,
    onUndo,
}: HistoryRowProps) {
    const focus = useRowFocus(isFocused)
    const cardStyle = { height: HISTORY_CARD_HEIGHT }
    const pressStyle = [cardStyle, focus.style]
    const press = () => onOpen(row.id)
    const texts = rowTexts(row)
    return (
        <View
            className="flex-row items-center gap-1 border-b border-border bg-background px-1"
            style={cardStyle}
        >
            <Pressable
                testID={`reconcile-history-row-${row.id}`}
                accessibilityRole="button"
                onPress={press}
                className="min-w-0 flex-1 justify-center gap-0.5"
                style={pressStyle}
                dataSet={focus.dataSet}
            >
                <View className="flex-row items-baseline justify-between gap-4">
                    <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                        {texts.day}
                    </Text>
                    <Text className="text-sm font-semibold tabular-nums text-foreground">
                        {texts.balance}
                    </Text>
                </View>
                <View className="flex-row items-baseline justify-between gap-4">
                    <Text numberOfLines={1} className="shrink text-sm text-foreground">
                        {texts.account}
                    </Text>
                    <Text numberOfLines={1} className="shrink-0 text-xs text-muted-foreground">
                        {texts.cleared}
                    </Text>
                </View>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {texts.reconciledCard}
                </Text>
            </Pressable>
            <CardMenu
                row={row}
                hasReport={hasReport}
                canUndo={canUndo}
                isUndoDisabled={isUndoDisabled}
                undoHint={undoHint}
                onOpenReport={onOpenReport}
                onUndo={onUndo}
            />
        </View>
    )
}

export function ReconcileHistoryHeader({
    sort,
    onSort,
}: {
    sort: HistorySort
    onSort: () => void
}) {
    return (
        <ListHeaderRow testID="reconcile-history-header" rowClass={HISTORY_HEADER_CLASS}>
            <ListSortHeaderCell
                label={HISTORY_TEXTS.statementEnding}
                style={HISTORY_CELLS.date}
                testID="reconcile-history-sort-date"
                sorted={sort}
                onPress={onSort}
            />
            <ListHeaderCell label={HISTORY_TEXTS.account} style={HISTORY_CELLS.account} />
            <ListHeaderCell
                label={HISTORY_TEXTS.endingBalance}
                style={HISTORY_CELLS.balance}
                align="right"
            />
            <ListHeaderCell label={HISTORY_TEXTS.cleared} style={HISTORY_CELLS.cleared} />
            <ListHeaderCell label={HISTORY_TEXTS.reconciled} style={HISTORY_CELLS.reconciled} />
            <View style={HISTORY_CELLS.action} />
        </ListHeaderRow>
    )
}
