import { Text, View } from 'react-native'
import { runNoticeText } from '../../lib/statement-texts'
import type { StatementRunOutcome } from '../../stores/statements-store'

/**
 * The notice above the list after a part of a run failed (statements spec §3.4):
 * "<n> of <m> statements were sent." (or saved), then one line for each failed customer,
 * "<name>: <the server's message>". It draws nothing while there is no outcome
 * (stores/statements-store.ts clears it at the next run and when the screen goes).
 */
export function StatementRunNotice({ outcome }: { outcome: StatementRunOutcome | null }) {
    if (outcome === null) return null
    const heading = runNoticeText(outcome)
    // Keyed by place: a customer may have two lines (a store and a send failure), and the
    // list is drawn once per outcome and never reordered.
    const lines = outcome.failed.map((item, index) => (
        <Text key={`failed-${index}`} className="text-sm text-danger">
            {`${item.name}: ${item.message}`}
        </Text>
    ))
    return (
        <View
            testID="statements-run-notice"
            accessibilityRole="alert"
            className="gap-1 rounded-lg border border-danger-soft-foreground bg-danger-soft px-3 py-2"
        >
            <Text className="text-sm font-semibold text-danger">{heading}</Text>
            {lines}
        </View>
    )
}
