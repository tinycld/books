import { TextInput } from '@tinycld/core/ui/form'
import { Platform, View } from 'react-native'
import type { EstimateResponse } from '../../hooks/useEstimateResponse'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import { PUBLIC_TEXTS } from '../../lib/estimate-public'
import { StepButtons, StepError } from './PublicStepParts'

const NAME_WRAPPER = { testID: 'estimate-public-name' }

// The Accept step (spec §3.3): the customer's name, then Accept estimate or Back. The name
// takes the focus when the step opens on web; native shows the keyboard on tap. Enter in
// the name submits.
export function AcceptStep({
    response,
    onBack,
}: {
    response: EstimateResponse
    onBack: () => void
}) {
    const { acceptForm, sending } = response
    const focus = useFocusOnOpen(Platform.OS === 'web')
    const { errors, isSubmitted } = acceptForm.formState
    const isSending = sending === 'accepted'
    const isBusy = sending !== null
    return (
        <View testID="estimate-public-accept-step" className="gap-3">
            <TextInput
                name="name"
                control={acceptForm.control}
                label={PUBLIC_TEXTS.nameLabel}
                testID="estimate-public-name-input"
                wrapperProps={NAME_WRAPPER}
                inputRef={focus.ref}
                autoComplete="name"
                returnKeyType="done"
                onSubmitEditing={response.submitAccept}
            />
            <StepError errors={errors} isSubmitted={isSubmitted} />
            <StepButtons
                confirmLabel={PUBLIC_TEXTS.acceptConfirm}
                sendingLabel={PUBLIC_TEXTS.accepting}
                confirmVariant="default"
                confirmTestID="estimate-public-accept-confirm"
                isBusy={isBusy}
                isSending={isSending}
                onConfirm={response.submitAccept}
                onBack={onBack}
            />
        </View>
    )
}
