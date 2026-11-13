import { Text, View } from 'react-native'
import { useDocumentKind } from './document-kind-context'

interface DocumentDetailProps {
    field: string
    label: string
    value: string
    // The value's own id suffix (`<kind>-message`), for a field whose text a test reads
    // without its label.
    valueSuffix?: string
}

// One body field of the read view; an empty value is left out. It is never wider than the
// column it sits in, so a long value wraps there: in a wrapping row of details its width
// would otherwise be its text's, past the card's edge.
export function DocumentDetail({ field, label, value, valueSuffix }: DocumentDetailProps) {
    const { doc } = useDocumentKind()
    if (value === '') return null
    const testID = `${doc.testId}-detail-${field}`
    const valueTestID = valueSuffix ? `${doc.testId}-${valueSuffix}` : undefined
    return (
        <View testID={testID} className="min-w-0 max-w-full gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text testID={valueTestID} className="text-sm text-foreground">
                {value}
            </Text>
        </View>
    )
}
