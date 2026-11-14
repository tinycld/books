import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { FormErrorSummary, SelectInput } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import { useSettingsForm } from '../../hooks/useSettingsForm'
import { PURCHASE_LINES_LABELS, PURCHASE_LINES_OPTIONS } from '../../lib/purchase-lines'
import { rootErrorOnly } from '../../lib/root-errors'
import { purchaseLinesSchema, purchaseLinesValues } from '../../lib/settings-schema'
import type { BooksSettings } from '../../types'
import { FieldNote, ReadOnlyRow } from './SectionCard'

export const BILL_LINES_NOTE =
    'The line tables a new bill starts with. A bill that already has lines of a hidden table still shows that table.'

interface BillLinesFormProps {
    settings: BooksSettings
    isAdmin: boolean
}

// "Bill lines" (bill form spec §3.11): an admin edits it on the card's own Save; everyone
// else reads it (the books_settings update rule is admin-only).
export function BillLinesForm({ settings, isAdmin }: BillLinesFormProps) {
    if (!isAdmin) {
        return (
            <ReadOnlyRow
                label="Bill lines"
                value={PURCHASE_LINES_LABELS[settings.purchase_lines]}
                testID="books-settings-bill-lines-readonly"
            />
        )
    }
    return <BillLinesEditor settings={settings} />
}

function BillLinesEditor({ settings }: { settings: BooksSettings }) {
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
                    label="Bill lines"
                    options={PURCHASE_LINES_OPTIONS}
                    testID="books-settings-bill-lines"
                />
            </View>
            <FieldNote text={BILL_LINES_NOTE} />
            <FormErrorSummary
                testID="books-settings-bill-lines-error"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <ServerActionButton
                    testID="books-settings-bill-lines-save"
                    isDisabled={isSaveDisabled}
                    onPress={submit}
                >
                    <ButtonText>Save</ButtonText>
                </ServerActionButton>
            </View>
        </View>
    )
}
