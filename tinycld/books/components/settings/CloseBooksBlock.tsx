import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type Control, FormErrorSummary, Toggle, useController } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { Text, View } from 'react-native'
import { useCloseBooks } from '../../hooks/useCloseBooks'
import { rootErrorOnly } from '../../lib/root-errors'
import type { CloseDateValues } from '../../lib/settings-schema'
import { ReopenDialog } from './ReopenDialog'
import { FieldNote } from './SectionCard'

interface ClosingDateProps {
    control: Control<CloseDateValues>
    isVisible: boolean
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null
    return (
        <Text className="text-xs text-danger" testID="books-settings-close-date-error">
            {message}
        </Text>
    )
}

function ClosingDate({ control, isVisible }: ClosingDateProps) {
    const { field, fieldState } = useController({ control, name: 'close_date' })
    if (!isVisible) return null
    return (
        <View className="gap-1">
            <Text className="text-sm font-semibold text-foreground">Closing date</Text>
            <DateField
                value={field.value}
                onChange={next => field.onChange(next ?? '')}
                withTime={false}
                accessibilityLabel="Closing date"
                testID="books-settings-close-date"
            />
            <FieldError message={fieldState.error?.message} />
            <FieldNote text="Entries dated on or before this day cannot be posted unless the person holds an override." />
        </View>
    )
}

export function CloseBooksBlock() {
    const close = useCloseBooks()
    const { control, formState } = close.form
    const { errors, isSubmitted } = formState
    const oldDate = close.reopen?.oldDate ?? ''
    return (
        <View className="gap-3 rounded-lg border border-border bg-background p-3">
            <Toggle
                control={control}
                name="closed"
                label="Close the books"
                testID="books-settings-close-toggle"
            />
            <ClosingDate control={control} isVisible={close.isClosed} />
            <FormErrorSummary
                testID="books-settings-close-errors"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <Button
                    testID="books-settings-close-save"
                    isDisabled={!close.isDirty || close.isPending}
                    onPress={close.submit}
                >
                    <ButtonText>Save close date</ButtonText>
                </Button>
            </View>
            <ReopenDialog
                isVisible={close.reopen !== null}
                oldDate={oldDate}
                onConfirm={close.confirmReopen}
                onCancel={close.cancelReopen}
            />
        </View>
    )
}
