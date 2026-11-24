import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { FormErrorSummary, SelectInput } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import { useSettingsForm } from '../../hooks/useSettingsForm'
import {
    COSTING_METHOD_LABELS,
    COSTING_METHOD_LOCKED,
    COSTING_METHOD_NOTE,
    COSTING_METHOD_OPTIONS,
    costingMethodOf,
    costingMethodView,
} from '../../lib/costing-method'
import { rootErrorOnly } from '../../lib/root-errors'
import { costingMethodSchema, costingMethodValues } from '../../lib/settings-schema'
import type { BooksSettings } from '../../types'
import { FieldNote, ReadOnlyRow } from './SectionCard'

interface CostingMethodFormProps {
    settings: BooksSettings
    isAdmin: boolean
}

function LockedNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="books-settings-costing-method-locked">
            <FieldNote text={COSTING_METHOD_LOCKED} />
        </View>
    )
}

// The costing method (books design, "Inventory"): an admin changes it on the card's own
// Save until the first inventory transaction posts. After that, and for everyone else,
// it is text; a locked method says why.
export function CostingMethodForm({ settings, isAdmin }: CostingMethodFormProps) {
    const view = costingMethodView(settings, isAdmin)
    if (view === 'edit') return <CostingMethodEditor settings={settings} />
    return (
        <View className="gap-2">
            <ReadOnlyRow
                label="Costing method"
                value={COSTING_METHOD_LABELS[costingMethodOf(settings)]}
                testID="books-settings-costing-method-readonly"
            />
            <LockedNote isVisible={view === 'locked'} />
        </View>
    )
}

function CostingMethodEditor({ settings }: { settings: BooksSettings }) {
    const { form, submit, isPending, isDirty } = useSettingsForm({
        schema: costingMethodSchema,
        values: costingMethodValues(settings),
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
                    name="costing_method"
                    label="Costing method"
                    options={COSTING_METHOD_OPTIONS}
                    testID="books-settings-costing-method"
                />
            </View>
            <FieldNote text={COSTING_METHOD_NOTE} />
            <FormErrorSummary
                testID="books-settings-costing-method-error"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <ServerActionButton
                    testID="books-settings-costing-method-save"
                    isDisabled={isSaveDisabled}
                    onPress={submit}
                >
                    <ButtonText>Save</ButtonText>
                </ServerActionButton>
            </View>
        </View>
    )
}
