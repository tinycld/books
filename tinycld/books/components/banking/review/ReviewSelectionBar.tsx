import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { ReviewTabModel } from '../../../hooks/useReviewTab'

const BAR_STYLE = { minHeight: 44 }
const BUTTON_STYLE = { minHeight: 36 }

function BatchContent({ model }: { model: ReviewTabModel }) {
    const action = model.batchAction
    if (!action) return null
    if (model.isBatchRunning) {
        return (
            <>
                <ButtonSpinner />
                <ButtonText>{action.busyLabel}</ButtonText>
            </>
        )
    }
    return <ButtonText>{action.label}</ButtonText>
}

function BatchButton({ model }: { model: ReviewTabModel }) {
    const action = model.batchAction
    if (!action) return null
    return (
        <Button
            testID={action.testID}
            variant="outline"
            size="sm"
            isDisabled={model.isBatchDisabled}
            accessibilityHint={model.batchHint}
            onPress={model.onBatch}
            style={BUTTON_STYLE}
        >
            <BatchContent model={model} />
        </Button>
    )
}

// In place of the toolbar while rows are chosen: the count and sums of the chosen rows on
// screen, the tab's batch button and Clear. It stays up, busy, for the whole of its run.
export function ReviewSelectionBar({ model }: { model: ReviewTabModel }) {
    return (
        <View
            testID="bank-review-selection"
            className="flex-row flex-wrap items-center gap-3 pb-2"
            style={BAR_STYLE}
        >
            <Text
                testID="bank-review-selection-text"
                className="text-sm font-medium tabular-nums text-foreground"
            >
                {model.selection.text}
            </Text>
            <View className="flex-row gap-2">
                <BatchButton model={model} />
                <Button
                    testID="bank-review-unselect"
                    variant="outline"
                    size="sm"
                    isDisabled={model.isChoiceDisabled}
                    onPress={model.onClearChoice}
                    style={BUTTON_STYLE}
                >
                    <ButtonText>Clear</ButtonText>
                </Button>
            </View>
        </View>
    )
}
