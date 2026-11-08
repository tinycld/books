import { View } from 'react-native'
import type { ReviewRowData, ReviewTabModel } from '../../../hooks/useReviewTab'
import { REVIEW_CELLS, REVIEW_ROW_HEIGHT, REVIEW_TABLE_MIN_WIDTH } from '../../../lib/bank-review'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../../ListTable'
import { SelectBox } from '../../SelectBox'
import { DateOrderToggle } from './DateOrderToggle'
import { ReviewRow, rowChoiceOf } from './ReviewRow'

function keyOf(row: ReviewRowData): string {
    return row.id
}

// The header's select-all, on the rows' check cell. Without a choice there is no check
// column at all, so the other columns keep their widths. ListHeaderCell holds a label
// only, so the box sits in a plain cell of the same width as the rows' box cell.
function HeaderCheckCell({ model }: { model: ReviewTabModel }) {
    if (!model.canChoose) return null
    return (
        <View style={REVIEW_CELLS.check}>
            <SelectBox
                testID="bank-review-select-all"
                label="Select all shown transactions"
                state={model.selectState}
                isDisabled={model.isChoiceDisabled}
                onPress={model.onToggleAll}
            />
        </View>
    )
}

function ReviewHeader({ model }: { model: ReviewTabModel }) {
    return (
        <ListHeaderRow testID="bank-review-header">
            <HeaderCheckCell model={model} />
            <DateOrderToggle
                order={model.dateOrder}
                onToggle={model.onToggleOrder}
                variant="header"
            />
            <ListHeaderCell label="Description" style={REVIEW_CELLS.description} />
            <ListHeaderCell label="Spent" style={REVIEW_CELLS.spent} align="right" />
            <ListHeaderCell label="Received" style={REVIEW_CELLS.received} align="right" />
        </ListHeaderRow>
    )
}

// The wide list of a transaction tab: windowed rows under a sticky header, sideways scroll
// below the table's minimum width.
export function ReviewTable({ model, currency }: { model: ReviewTabModel; currency: string }) {
    const renderRow = (row: ReviewRowData) => {
        const isOpen = row.id === model.openTxnId
        const choice = rowChoiceOf(model, row.id)
        return (
            <ReviewRow
                row={row}
                currency={currency}
                isOpen={isOpen}
                onOpen={model.onOpenRow}
                choice={choice}
            />
        )
    }
    const header = <ReviewHeader model={model} />
    return (
        <ListTable
            testID="bank-review-table"
            minWidth={REVIEW_TABLE_MIN_WIDTH}
            rowHeight={REVIEW_ROW_HEIGHT}
            header={header}
            rows={model.rows}
            keyOf={keyOf}
            renderRow={renderRow}
            onNearEnd={model.onNearEnd}
        />
    )
}
