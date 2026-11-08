import { Text, View } from 'react-native'
import type { ReviewRowData, ReviewTabModel } from '../../../hooks/useReviewTab'
import { REVIEW_CARD_HEIGHT } from '../../../lib/bank-review'
import { ListCards } from '../../ListCards'
import { SelectBox } from '../../SelectBox'
import { DateOrderToggle } from './DateOrderToggle'
import { ReviewCard, rowChoiceOf } from './ReviewRow'

// Module level: ListCards memoizes the heights on it.
function heightOf(): number {
    return REVIEW_CARD_HEIGHT
}

function keyOf(row: ReviewRowData): string {
    return row.id
}

// The phone's select-all: the box and its "Select all" label, which presses it too. The
// box carries the accessible name, so the label is not a second control for a screen
// reader.
function PhoneSelectAll({ model }: { model: ReviewTabModel }) {
    if (!model.canChoose) return null
    const onLabelPress = model.isChoiceDisabled ? undefined : model.onToggleAll
    return (
        <View className="flex-row items-center">
            <SelectBox
                testID="bank-review-select-all"
                label="Select all shown transactions"
                state={model.selectState}
                isDisabled={model.isChoiceDisabled}
                onPress={model.onToggleAll}
            />
            <Text
                accessible={false}
                importantForAccessibility="no"
                onPress={onLabelPress}
                className="text-sm text-foreground"
            >
                Select all
            </Text>
        </View>
    )
}

// Above the cards: select-all on the left (writers on For review and Excluded), the date
// order on the right.
function ReviewPhoneBar({ model }: { model: ReviewTabModel }) {
    return (
        <View
            testID="bank-review-phone-bar"
            className="flex-row items-center justify-between"
            style={{ minHeight: 44 }}
        >
            <PhoneSelectAll model={model} />
            <View />
            <DateOrderToggle order={model.dateOrder} onToggle={model.onToggleOrder} variant="bar" />
        </View>
    )
}

// The phone list of a transaction tab: windowed cards of one fixed height.
export function ReviewCards({ model, currency }: { model: ReviewTabModel; currency: string }) {
    const renderCard = (row: ReviewRowData, height: number) => {
        const isOpen = row.id === model.openTxnId
        const isFocused = row.id === model.focusedTxnId
        const choice = rowChoiceOf(model, row.id)
        return (
            <ReviewCard
                row={row}
                currency={currency}
                height={height}
                isOpen={isOpen}
                isFocused={isFocused}
                onOpen={model.onOpenRow}
                choice={choice}
            />
        )
    }
    return (
        <View className="min-h-0 flex-1">
            <ReviewPhoneBar model={model} />
            <ListCards
                testID="bank-review-cards"
                rows={model.rows}
                heightOf={heightOf}
                keyOf={keyOf}
                renderCard={renderCard}
                onNearEnd={model.onNearEnd}
                scrollToIndex={model.focusedIndex}
            />
        </View>
    )
}
