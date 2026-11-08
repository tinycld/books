import { Text } from 'react-native'
import type { ReviewTabModel } from '../../../hooks/useReviewTab'

const TONE_CLASS = { muted: 'text-muted-foreground', danger: 'text-danger' } as const

// The outcome of the last Exclude or Move to For review, under the toolbar until the next
// action or a tab change; read out politely by a screen reader.
export function ReviewResultLine({ result }: { result: ReviewTabModel['result'] }) {
    if (!result) return null
    const className = `pb-2 text-sm ${TONE_CLASS[result.tone]}`
    return (
        <Text testID="bank-review-result" accessibilityLiveRegion="polite" className={className}>
            {result.text}
        </Text>
    )
}
