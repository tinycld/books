import type { ReviewRowData, ReviewTabModel } from '../../../hooks/useReviewTab'
import { REVIEW_CELLS, REVIEW_ROW_HEIGHT, REVIEW_TABLE_MIN_WIDTH } from '../../../lib/bank-review'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../../ListTable'
import { DateOrderToggle } from './DateOrderToggle'
import { ReviewRow } from './ReviewRow'

function keyOf(row: ReviewRowData): string {
    return row.id
}

function ReviewHeader({ model }: { model: ReviewTabModel }) {
    return (
        <ListHeaderRow testID="bank-review-header">
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
        return <ReviewRow row={row} currency={currency} isOpen={isOpen} onOpen={model.onOpenRow} />
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
