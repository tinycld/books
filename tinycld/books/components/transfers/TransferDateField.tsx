import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { useController, useFormContext } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { TransferFormValues } from '../../lib/transfer'

function DateError({ message }: { message?: string }) {
    if (!message) return null
    return <Text className="text-xs text-danger">{message}</Text>
}

// Core DateField reports a cleared field as null; the schema's date is a string, so a
// cleared field reaches it as '' and shows the date message.
export function TransferDateField() {
    const { control } = useFormContext<TransferFormValues>()
    const { field, fieldState } = useController({ control, name: 'date' })
    return (
        <View className="gap-1.5 mb-3">
            <Text className="text-sm font-semibold text-foreground">Date</Text>
            <DateField
                value={field.value || null}
                onChange={next => field.onChange(next ?? '')}
                withTime={false}
                accessibilityLabel="Date"
                testID="transfer-date"
            />
            <DateError message={fieldState.error?.message} />
        </View>
    )
}
