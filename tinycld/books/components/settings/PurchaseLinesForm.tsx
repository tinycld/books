import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { FormErrorSummary, SelectInput } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import { useSettingsForm } from '../../hooks/useSettingsForm'
import { PURCHASE_LINES_LABELS, PURCHASE_LINES_OPTIONS } from '../../lib/purchase-lines'
import { rootErrorOnly } from '../../lib/root-errors'
import { purchaseLinesSchema, purchaseLinesValues } from '../../lib/settings-schema'
import type { BooksSettings } from '../../types'
import { FieldNote, ReadOnlyRow } from './SectionCard'

export const PURCHASE_LINES_NOTE =
    'Which line tables new bills and expenses show. A form still shows a table its record already has lines in.'

interface PurchaseLinesFormProps {
    settings: BooksSettings
    isAdmin: boolean
}

// "Purchase lines" (expense form spec §3.10): one setting for the line tables of new bills
// and expenses. An admin edits it on the card's own Save; everyone else reads it (the
// books_settings update rule is admin-only).
export function PurchaseLinesForm({ settings, isAdmin }: PurchaseLinesFormProps) {
    if (!isAdmin) {
        return (
            <ReadOnlyRow
                label="Purchase lines"
                value={PURCHASE_LINES_LABELS[settings.purchase_lines]}
                testID="books-settings-purchase-lines-readonly"
            />
        )
    }
    return <PurchaseLinesEditor settings={settings} />
}

function PurchaseLinesEditor({ settings }: { settings: BooksSettings }) {
    const { form, submit, isPending, isDirty } = useSettingsForm({
        schema: purchaseLinesSchema,
        values: purchaseLinesValues(settings),
        toPatch: values => values,
    })
    const { control, formState } = form
    const { errors, isSubmitted } = formState
    const isSaveDisabled = !isDirty || isPending
    return (
        <View className="gap-4">
            <View className="w-full max-w-[360px]">
                <SelectInput
                    control={control}
                    name="purchase_lines"
                    label="Purchase lines"
                    options={PURCHASE_LINES_OPTIONS}
                    testID="books-settings-purchase-lines"
                />
            </View>
            <FieldNote text={PURCHASE_LINES_NOTE} />
            <FormErrorSummary
                testID="books-settings-purchase-lines-error"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <ServerActionButton
                    testID="books-settings-purchase-lines-save"
                    isDisabled={isSaveDisabled}
                    onPress={submit}
                >
                    <ButtonText>Save</ButtonText>
                </ServerActionButton>
            </View>
        </View>
    )
}
