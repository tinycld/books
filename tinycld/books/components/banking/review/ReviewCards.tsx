import type { ReviewRowData, ReviewTabModel } from '../../../hooks/useReviewTab'
import { REVIEW_CARD_HEIGHT } from '../../../lib/bank-review'
import { ListCards } from '../../ListCards'
import { ReviewCard } from './ReviewRow'

// Module level: ListCards memoizes the heights on it.
function heightOf(): number {
    return REVIEW_CARD_HEIGHT
}

function keyOf(row: ReviewRowData): string {
    return row.id
}

// The phone list of a transaction tab: windowed cards of one fixed height.
export function ReviewCards({ model, currency }: { model: ReviewTabModel; currency: string }) {
    const renderCard = (row: ReviewRowData, height: number) => (
        <ReviewCard row={row} currency={currency} height={height} />
    )
    return (
        <ListCards
            testID="bank-review-cards"
            rows={model.rows}
            heightOf={heightOf}
            keyOf={keyOf}
            renderCard={renderCard}
            onNearEnd={model.onNearEnd}
        />
    )
}
