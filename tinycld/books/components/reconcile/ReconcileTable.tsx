import { View } from 'react-native'
import type { ReconcileLineRow } from '../../hooks/useReconcileLines'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { sortStateOf } from '../../lib/reconcile'
import { useReconcileStore } from '../../stores/reconcile-store'
import { ListHeaderCell, ListHeaderRow, ListSortHeaderCell, ListTable } from '../ListTable'
import {
    LINE_CELLS,
    LINE_ROW_CLASS,
    LINE_ROW_HEIGHT,
    LINES_MIN_WIDTH,
    ReconcileRow,
    SelectAllBox,
} from './ReconcileRow'

function ignore() {}

function lineKey(row: ReconcileLineRow): string {
    return row.id
}

// A reader's header keeps the box cell empty, so the columns line up with the rows.
function HeaderCheckCell({ model }: { model: ReconcileScreenModel }) {
    return (
        <View className="items-center justify-center" style={LINE_CELLS.check}>
            <SelectAllBox model={model} />
        </View>
    )
}

// The Date, Payment and Deposit headers sort; a second press reverses.
function LinesHeader({ model }: { model: ReconcileScreenModel }) {
    const toggleSort = useReconcileStore(s => s.toggleSort)
    const { words, sort } = model
    const onDate = () => toggleSort('date')
    const onOut = () => toggleSort('out')
    const onIn = () => toggleSort('in')
    const dateSorted = sortStateOf(sort, 'date')
    const outSorted = sortStateOf(sort, 'out')
    const inSorted = sortStateOf(sort, 'in')
    return (
        <ListHeaderRow testID="reconcile-header" rowClass={LINE_ROW_CLASS}>
            <HeaderCheckCell model={model} />
            <ListSortHeaderCell
                testID="reconcile-sort-date"
                label="Date"
                style={LINE_CELLS.date}
                sorted={dateSorted}
                onPress={onDate}
            />
            <ListHeaderCell label="Transaction" style={LINE_CELLS.transaction} />
            <ListHeaderCell label="Payee" style={LINE_CELLS.payee} />
            <ListHeaderCell label="Memo" style={LINE_CELLS.memo} />
            <ListSortHeaderCell
                testID="reconcile-sort-out"
                label={words.outColumn}
                style={LINE_CELLS.amount}
                align="right"
                sorted={outSorted}
                onPress={onOut}
            />
            <ListSortHeaderCell
                testID="reconcile-sort-in"
                label={words.inColumn}
                style={LINE_CELLS.amount}
                align="right"
                sorted={inSorted}
                onPress={onIn}
            />
        </ListHeaderRow>
    )
}

/**
 * The work screen's wide list (reconcile spec §3 "The list (wide)"): the windowed table of
 * the shown rows, 44 high, under its sticky header with the select-all box and the sort
 * headers. Drawn only at or above LINES_MIN_WIDTH (ReconcileScreenView's useFitsTable), so
 * it never scrolls sideways. The keys scroll the focused row into view through the
 * screen's `listScrollRef`.
 */
export function ReconcileTable({
    model,
    onGutter,
}: {
    model: ReconcileScreenModel
    onGutter: (gutter: number) => void
}) {
    const renderRow = (row: ReconcileLineRow) => <ReconcileRow row={row} model={model} />
    const header = <LinesHeader model={model} />
    return (
        <ListTable
            testID="reconcile-table"
            minWidth={LINES_MIN_WIDTH}
            rowHeight={LINE_ROW_HEIGHT}
            header={header}
            rows={model.shown}
            keyOf={lineKey}
            renderRow={renderRow}
            onNearEnd={ignore}
            onGutter={onGutter}
            scrollHandle={model.listScrollRef}
        />
    )
}
