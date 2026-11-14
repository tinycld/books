import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useEstimateDeclineNote } from '../../hooks/useEstimateDeclineNote'
import type { BooksEstimates } from '../../types'

export const DECLINE_NOTE_LOAD_ERROR = "Books could not load the customer's answer."

interface EstimateDeclineNoteProps {
    estimateId: string
    status: BooksEstimates['status'] | undefined
    testID: string
    /** The space above the note where it sits: the band and the read view differ. */
    className?: string
}

// The full reason, wrapped and never cut: the customer may write several lines.
function DeclineReason({ reason }: { reason: string }) {
    if (reason === '') return null
    return (
        <Text className="text-sm text-muted-foreground">
            Reason: <Text className="text-foreground">{reason}</Text>
        </Text>
    )
}

function DeclineNoteError({ className, onRetry }: { className: string; onRetry: () => void }) {
    const rowClass = `flex-row flex-wrap items-center gap-2 ${className}`
    return (
        <View testID="estimate-decline-note-error" accessibilityRole="alert" className={rowClass}>
            <Text className="text-sm text-muted-foreground">{DECLINE_NOTE_LOAD_ERROR}</Text>
            <Button
                testID="estimate-decline-note-retry"
                variant="outline"
                size="sm"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

// The customer's decline under the estimate's status (spec §3.5): read-only, shown while
// the saved status is Rejected and the newest response is a decline. While its query
// loads it shows nothing (the status is already on screen); a failed load shows its
// error with Retry in its place.
export function EstimateDeclineNote({
    estimateId,
    status,
    testID,
    className = '',
}: EstimateDeclineNoteProps) {
    const { note, loadFailed, retry } = useEstimateDeclineNote(estimateId, status)
    if (loadFailed) return <DeclineNoteError className={className} onRetry={retry} />
    if (note === null) return null
    const lead = `Declined by the customer on ${note.date}.`
    const noteClass = `gap-1 ${className}`
    return (
        <View testID={testID} className={noteClass}>
            <Text className="text-sm text-muted-foreground">{lead}</Text>
            <DeclineReason reason={note.reason} />
        </View>
    )
}
