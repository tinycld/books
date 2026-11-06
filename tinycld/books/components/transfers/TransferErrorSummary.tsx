import { FormErrorSummary } from '@tinycld/core/ui/form'
import { useFormContext, useFormState } from 'react-hook-form'
import { View } from 'react-native'
import { rootErrorOnly } from '../../lib/root-errors'
import type { TransferFormValues } from '../../lib/transfer'

// Only a server refusal shows here; field errors render under their fields. An empty
// summary would still take its padding out of the screen.
export function TransferErrorSummary() {
    const { control } = useFormContext<TransferFormValues>()
    const { errors, isSubmitted } = useFormState({ control })
    if (!errors.root?.message) return null
    return (
        <View className="px-4 pt-3">
            <FormErrorSummary
                errors={rootErrorOnly(errors)}
                isEnabled={isSubmitted}
                showFieldNames={false}
                title={null}
                variant="destructive"
                testID="transfer-error-summary"
            />
        </View>
    )
}
