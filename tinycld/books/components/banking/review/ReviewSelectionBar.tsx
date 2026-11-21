import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { ReviewTabModel } from '../../../hooks/useReviewTab'

const BAR_STYLE = { minHeight: 44 }
const BUTTON_STYLE = { minHeight: 36 }

type BarButtonModel = {
    testID: string
    label: string
    busyLabel: string
    isRunning: boolean
    isDisabled: boolean
    hint: string | undefined
    onPress: () => void
}

function BatchContent({ action }: { action: BarButtonModel }) {
    if (action.isRunning) {
        return (
            <>
                <ButtonSpinner />
                <ButtonText>{action.busyLabel}</ButtonText>
            </>
        )
    }
    return <ButtonText>{action.label}</ButtonText>
}

// One action of the bar, outline; busy with core ButtonSpinner while its own run is in
// flight. While any run is in flight every bar action is disabled (the page's one batch).
function BatchButton({ action }: { action: BarButtonModel | null }) {
    if (!action) return null
    return (
        <Button
            testID={action.testID}
            variant="outline"
            size="sm"
            isDisabled={action.isDisabled}
            accessibilityHint={action.hint}
            onPress={action.onPress}
            style={BUTTON_STYLE}
        >
            <BatchContent action={action} />
        </Button>
    )
}

function moveButton(model: ReviewTabModel): BarButtonModel | null {
    const action = model.batchAction
    if (!action) return null
    return {
        testID: action.testID,
        label: action.label,
        busyLabel: action.busyLabel,
        isRunning: model.runningKind === action.kind,
        isDisabled: model.isBatchDisabled,
        hint: model.batchHint,
        onPress: model.onBatch,
    }
}

// In place of the toolbar while rows are chosen: the count and sums of the chosen rows on
// screen, Match and Categorize (For review), the tab's move button and Clear. It stays up,
// busy, for the whole of its run.
export function ReviewSelectionBar({ model }: { model: ReviewTabModel }) {
    const move = moveButton(model)
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
                <BatchButton action={model.matchAction} />
                <BatchButton action={model.categorizeAction} />
                <BatchButton action={move} />
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
