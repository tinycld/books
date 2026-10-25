import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type Control, FormErrorSummary, useController } from '@tinycld/core/ui/form'
import { Menu } from '@tinycld/core/ui/menu'
import { ChevronDown } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { useSettingsForm } from '../../hooks/useSettingsForm'
import { rootErrorOnly } from '../../lib/root-errors'
import { type FiscalYearValues, fiscalYearSchema } from '../../lib/settings-schema'
import { FISCAL_MONTHS } from '../../lib/setup-schema'
import { FieldNote } from './SectionCard'

const TEST_ID = 'books-settings-fiscal-month'

// Exists because the schema keeps the month a number, and the core SelectInput only holds string values.
function MonthSelect({ control }: { control: Control<FiscalYearValues> }) {
    const muted = useThemeColor('muted-foreground')
    const { field, fieldState } = useController({ control, name: 'fiscal_year_start_month' })
    const shown = FISCAL_MONTHS[field.value - 1] ?? ''
    const items = FISCAL_MONTHS.map((label, index) => (
        <Menu.Item
            key={label}
            label={label}
            isSelected={index + 1 === field.value}
            onSelect={() => field.onChange(index + 1)}
            testID={`${TEST_ID}-${index + 1}`}
        />
    ))
    const errorMessage = fieldState.error?.message
    const errorText = errorMessage ? (
        <Text className="text-xs text-danger" testID={`${TEST_ID}-error`}>
            {errorMessage}
        </Text>
    ) : null
    const trigger = (
        <Pressable
            className="flex-row items-center justify-between gap-2 rounded-md border border-border px-3"
            style={{ minHeight: 44 }}
            accessibilityLabel={`Fiscal year starts in: ${shown}`}
            testID={TEST_ID}
        >
            <Text className="text-sm text-foreground">{shown}</Text>
            <ChevronDown size={12} color={muted} />
        </Pressable>
    )
    return (
        <View className="gap-1.5">
            <Text className="text-sm font-semibold text-foreground">Fiscal year starts in</Text>
            <Menu presentation="popover" trigger={trigger}>
                {items}
            </Menu>
            {errorText}
            <FieldNote text="Reports use this from now on. No entries change." />
        </View>
    )
}

export function FiscalYearForm() {
    const { settings } = useBooksSettings()
    const { form, submit, isPending, isDirty } = useSettingsForm({
        schema: fiscalYearSchema,
        values: { fiscal_year_start_month: settings?.fiscal_year_start_month ?? 1 },
        toPatch: values => ({ fiscal_year_start_month: values.fiscal_year_start_month }),
    })
    const { errors, isSubmitted } = form.formState
    return (
        <View className="gap-4">
            <MonthSelect control={form.control} />
            <FormErrorSummary
                testID="books-settings-fiscal-errors"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <Button
                    testID="books-settings-fiscal-save"
                    isDisabled={!isDirty || isPending}
                    onPress={submit}
                >
                    <ButtonText>Save</ButtonText>
                </Button>
            </View>
        </View>
    )
}
