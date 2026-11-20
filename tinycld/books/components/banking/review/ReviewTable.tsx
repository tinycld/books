import { View } from 'react-native'
import type { ReviewRowData, ReviewTabModel } from '../../../hooks/useReviewTab'
import {
    REVIEW_CELLS,
    REVIEW_ROW_HEIGHT,
    REVIEW_TABLE_MIN_WIDTH,
    REVIEWED_CELLS,
} from '../../../lib/bank-review'
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

function InBooksHeaderCell({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <ListHeaderCell label="In Books" style={REVIEWED_CELLS.inBooks} />
}

// Reviewed reads REVIEWED_CELLS (with In Books); the other tabs REVIEW_CELLS.
function ReviewHeader({ model }: { model: ReviewTabModel }) {
    const cells = model.showsInBooks ? REVIEWED_CELLS : REVIEW_CELLS
    return (
        <ListHeaderRow testID="bank-review-header">
            <HeaderCheckCell model={model} />
            <DateOrderToggle
                order={model.dateOrder}
                onToggle={model.onToggleOrder}
                variant="header"
                isReviewed={model.showsInBooks}
            />
            <ListHeaderCell label="Description" style={cells.description} />
            <InBooksHeaderCell isVisible={model.showsInBooks} />
            <ListHeaderCell label="Spent" style={cells.spent} align="right" />
            <ListHeaderCell label="Received" style={cells.received} align="right" />
        </ListHeaderRow>
    )
}

// The wide list of a transaction tab: windowed rows under a sticky header. It shows only
// where its minimum width fits (ReviewTabBody's useFitsTable), so it never scrolls
// sideways; `onGutter` reports the scrollbar gutter to that check.
export function ReviewTable({
    model,
    currency,
    onGutter,
}: {
    model: ReviewTabModel
    currency: string
    onGutter: (gutter: number) => void
}) {
    const renderRow = (row: ReviewRowData) => {
        const isOpen = row.id === model.openTxnId
        const isFocused = row.id === model.focusedTxnId
        const choice = rowChoiceOf(model, row.id)
        return (
            <ReviewRow
                row={row}
                currency={currency}
                isOpen={isOpen}
                isFocused={isFocused}
                onOpen={model.onOpenRow}
                choice={choice}
                showsInBooks={model.showsInBooks}
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
            scrollToIndex={model.focusedIndex}
            onGutter={onGutter}
        />
    )
}
