import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { FormErrorSummary, TextAreaInput } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import { useSettingsForm } from '../../hooks/useSettingsForm'
import { rootErrorOnly } from '../../lib/root-errors'
import { defaultMessageSchema, defaultMessageValues } from '../../lib/settings-schema'
import type { BooksSettings } from '../../types'
import { FieldNote } from './SectionCard'

export const DEFAULT_MESSAGE_NOTE =
    'New invoices, estimates and sales receipts start with this message. You can change it on each one.'

// "Default message to customer": the message a new invoice, estimate or sales receipt starts with.
export function DefaultMessageForm({ settings }: { settings: BooksSettings }) {
    const { form, submit, isPending, isDirty } = useSettingsForm({
        schema: defaultMessageSchema,
        values: defaultMessageValues(settings),
        toPatch: values => ({ default_customer_message: values.default_customer_message }),
    })
    const { control, formState } = form
    const { errors, isSubmitted } = formState
    const isSaveDisabled = !isDirty || isPending
    return (
        <View className="gap-4">
            <TextAreaInput
                control={control}
                name="default_customer_message"
                label="Default message to customer"
                testID="books-settings-default-message"
            />
            <FieldNote text={DEFAULT_MESSAGE_NOTE} />
            <FormErrorSummary
                testID="books-settings-default-message-errors"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <ServerActionButton
                    testID="books-settings-default-message-save"
                    isDisabled={isSaveDisabled}
                    onPress={submit}
                >
                    <ButtonText>Save</ButtonText>
                </ServerActionButton>
            </View>
        </View>
    )
}
