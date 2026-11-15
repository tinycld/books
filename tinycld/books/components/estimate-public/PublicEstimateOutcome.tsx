import { type FieldErrors, FormErrorSummary } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import type { PublicOutcome } from '../../lib/estimate-public'

interface PublicEstimateOutcomeProps {
    outcome: PublicOutcome
    lines: string[]
    // A server refusal of the customer's answer: it stays above the new state's text, so
    // the customer sees why the answer did not count.
    refusal?: string
}

function refusalErrors(message: string): FieldErrors {
    if (message === '') return {}
    return { server: { type: 'server', message } }
}

function RefusalBox({ message }: { message: string }) {
    return (
        <FormErrorSummary
            testID="estimate-public-refusal"
            errors={refusalErrors(message)}
            isEnabled={message !== ''}
            variant="destructive"
            title={null}
            showFieldNames={false}
        />
    )
}

function OutcomeLine({ text }: { text: string }) {
    return <Text className="text-center text-sm text-foreground">{text}</Text>
}

function OutcomeLines({ outcome, lines }: { outcome: PublicOutcome; lines: string[] }) {
    if (lines.length === 0) return null
    const items = lines.map(text => <OutcomeLine key={text} text={text} />)
    return (
        <View testID={`estimate-public-${outcome}`} className="gap-1">
            {items}
        </View>
    )
}

// The state of an estimate with no decision left (spec §3.4): accepted, declined, closed
// or expired. No buttons.
export function PublicEstimateOutcome({
    outcome,
    lines,
    refusal = '',
}: PublicEstimateOutcomeProps) {
    if (lines.length === 0 && refusal === '') return null
    return (
        <View className="gap-3 border-t border-border pt-4">
            <RefusalBox message={refusal} />
            <OutcomeLines outcome={outcome} lines={lines} />
        </View>
    )
}
