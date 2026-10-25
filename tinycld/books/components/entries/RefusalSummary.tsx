import { FormErrorSummary } from '@tinycld/core/ui/form'
import { View } from 'react-native'

// A server refusal inside a dialog, drawn like the entry form's summary.
export function RefusalSummary({ message }: { message: string | null | undefined }) {
    if (!message) return null
    return (
        <View className="pt-3">
            <FormErrorSummary
                errors={{ server: { type: 'server', message } }}
                isEnabled
                showFieldNames={false}
                title={null}
                variant="destructive"
                testID="entry-error-summary"
            />
        </View>
    )
}
