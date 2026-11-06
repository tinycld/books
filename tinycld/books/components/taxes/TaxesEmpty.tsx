import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { EmptyState } from '../../lib/taxes-view'

interface TaxesEmptyProps {
    state: EmptyState
    action: ReactNode
}

// A writer gets a card that asks the first question; a reader only reads that nothing
// is set up.
const WRITER_BOX = 'items-center gap-3 rounded-xl border border-border bg-surface-secondary p-8'
const READER_BOX = 'items-center p-8'

function Hint({ text }: { text: string | null }) {
    if (text === null) return null
    return <Text className="text-center text-sm text-muted-foreground">{text}</Text>
}

export function TaxesEmpty({ state, action }: TaxesEmptyProps) {
    const box = state.showAddAgency ? WRITER_BOX : READER_BOX
    return (
        <View testID="taxes-empty" className={box}>
            <Text className="text-center text-base font-semibold text-foreground">
                {state.title}
            </Text>
            <Hint text={state.hint} />
            {action}
        </View>
    )
}
