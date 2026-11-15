import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { type FieldErrors, type FieldValues, FormErrorSummary } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import { PUBLIC_TEXTS } from '../../lib/estimate-public'
import { rootErrorOnly } from '../../lib/root-errors'

// Every button on the customer's page is at least a 44 pt tap target.
export const PUBLIC_TAP = { minHeight: 44 }

// The step's server answer (a refusal, or the network text). Field errors draw under their
// field, so the summary shows only the root error.
export function StepError<T extends FieldValues>({
    errors,
    isSubmitted,
}: {
    errors: FieldErrors<T>
    isSubmitted: boolean
}) {
    return (
        <FormErrorSummary
            testID="estimate-public-step-error"
            errors={rootErrorOnly(errors)}
            isEnabled={isSubmitted}
            variant="destructive"
            title={null}
            showFieldNames={false}
        />
    )
}

function SendingSpinner({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <ButtonSpinner />
}

interface StepButtonsProps {
    confirmLabel: string
    sendingLabel: string
    confirmVariant: 'default' | 'destructive'
    confirmTestID: string
    // Some answer is in flight: both buttons wait for it.
    isBusy: boolean
    // This step's answer is the one in flight.
    isSending: boolean
    onConfirm: () => void
    onBack: () => void
}

// Confirm and Back of an Accept or Decline step. While the answer is in flight both are
// disabled and the confirm reads its sending label. An answer sent offline fails with the
// network text and keeps the step open (spec §3.3).
export function StepButtons(props: StepButtonsProps) {
    const label = props.isSending ? props.sendingLabel : props.confirmLabel
    return (
        <View className="gap-3">
            <Button
                testID={props.confirmTestID}
                variant={props.confirmVariant}
                style={PUBLIC_TAP}
                isDisabled={props.isBusy}
                onPress={props.onConfirm}
            >
                <SendingSpinner isVisible={props.isSending} />
                <ButtonText>{label}</ButtonText>
            </Button>
            <Button
                testID="estimate-public-back"
                variant="outline"
                style={PUBLIC_TAP}
                isDisabled={props.isBusy}
                onPress={props.onBack}
            >
                <ButtonText>{PUBLIC_TEXTS.back}</ButtonText>
            </Button>
        </View>
    )
}
