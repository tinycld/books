import { TextAreaInput } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import type { EstimateResponse } from '../../hooks/useEstimateResponse'
import { declineQuestionOf, PUBLIC_TEXTS } from '../../lib/estimate-public'
import { StepButtons, StepError } from './PublicStepParts'

const REASON_WRAPPER = { testID: 'estimate-public-reason' }

// The Decline step (spec §3.3): the question, an optional reason, then Decline estimate or
// Back. The reason takes no focus (it is optional), and Enter in it adds a line break.
export function DeclineStep({
    response,
    business,
    onBack,
}: {
    response: EstimateResponse
    business: string
    onBack: () => void
}) {
    const { declineForm, sending } = response
    const question = declineQuestionOf(business)
    const { errors, isSubmitted } = declineForm.formState
    const isSending = sending === 'declined'
    const isBusy = sending !== null
    return (
        <View testID="estimate-public-decline-step" className="gap-3">
            <Text className="text-center text-sm text-foreground">{question}</Text>
            <TextAreaInput
                name="reason"
                control={declineForm.control}
                label={PUBLIC_TEXTS.reasonLabel}
                testID="estimate-public-reason-input"
                wrapperProps={REASON_WRAPPER}
                numberOfLines={4}
            />
            <StepError errors={errors} isSubmitted={isSubmitted} />
            <StepButtons
                confirmLabel={PUBLIC_TEXTS.declineConfirm}
                sendingLabel={PUBLIC_TEXTS.declining}
                confirmVariant="destructive"
                confirmTestID="estimate-public-decline-confirm"
                isBusy={isBusy}
                isSending={isSending}
                onConfirm={response.submitDecline}
                onBack={onBack}
            />
        </View>
    )
}
