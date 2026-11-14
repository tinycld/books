import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useDecisionStep } from '../../hooks/useDecisionStep'
import type { EstimateResponse } from '../../hooks/useEstimateResponse'
import { decideTextOf, PUBLIC_TEXTS } from '../../lib/estimate-public'
import { AcceptStep } from './AcceptStep'
import { DeclineStep } from './DeclineStep'
import { PUBLIC_TAP } from './PublicStepParts'

interface DecideChoiceProps {
    business: string
    onAccept: () => void
    onDecline: () => void
}

function DecideChoice({ business, onAccept, onDecline }: DecideChoiceProps) {
    const lead = decideTextOf(business)
    return (
        <View testID="estimate-public-decide" className="gap-3">
            <Text className="text-center text-sm text-muted-foreground">{lead}</Text>
            <Button testID="estimate-public-accept" style={PUBLIC_TAP} onPress={onAccept}>
                <ButtonText>{PUBLIC_TEXTS.accept}</ButtonText>
            </Button>
            <Button
                testID="estimate-public-decline"
                variant="outline"
                style={PUBLIC_TAP}
                onPress={onDecline}
            >
                <ButtonText>{PUBLIC_TEXTS.decline}</ButtonText>
            </Button>
        </View>
    )
}

interface PublicDecisionProps {
    response: EstimateResponse
    business: string
}

// The customer's decision in the card (spec §3.3, direction A): Accept and Decline, or the
// inline step one of them opened. No dialog and no keyboard shortcuts.
export function PublicDecision({ response, business }: PublicDecisionProps) {
    const decision = useDecisionStep(response)
    if (decision.step === 'accept') return <AcceptStep response={response} onBack={decision.back} />
    if (decision.step === 'decline') {
        return <DeclineStep response={response} business={business} onBack={decision.back} />
    }
    return (
        <DecideChoice
            business={business}
            onAccept={decision.openAccept}
            onDecline={decision.openDecline}
        />
    )
}
