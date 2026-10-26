import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { useController, useFormContext } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { EntryFormValues } from '../../lib/entry-schema'

interface EntryDateFieldProps {
    name: 'date' | 'autoReverseOn'
    label: string
    hint: string
    testID: string
    onEdit: () => void
}

// A date typed as YYYY-MM-DD or picked from core's calendar; the schema validates either.
export function EntryDateField({ name, label, hint, testID, onEdit }: EntryDateFieldProps) {
    const { control } = useFormContext<EntryFormValues>()
    const { field, fieldState } = useController({ control, name })
    const message = fieldState.error?.message
    return (
        <View className="gap-1.5 mb-3">
            <Text className="text-sm font-semibold text-foreground">{label}</Text>
            <DateField
                value={field.value || null}
                onChange={next => {
                    field.onChange(next ?? '')
                    onEdit()
                }}
                withTime={false}
                accessibilityLabel={label}
                testID={testID}
            />
            <FieldNote hint={hint} message={message} />
        </View>
    )
}

function FieldNote({ hint, message }: { hint: string; message?: string }) {
    if (message) return <Text className="text-xs text-danger">{message}</Text>
    return <Text className="text-xs text-muted">{hint}</Text>
}
