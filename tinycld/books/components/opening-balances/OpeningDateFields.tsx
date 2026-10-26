import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { SelectInput, type SelectOption, useController } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { TextInput as RNTextInput, Text, View } from 'react-native'
import type { OpeningForm } from '../../hooks/useOpeningBalancesForm'

const PRESET_OPTIONS: SelectOption[] = [
    { value: 'last-fiscal-year', label: 'End of last fiscal year' },
    { value: 'last-month', label: 'End of last month' },
    { value: 'custom', label: 'Custom date' },
]

function DateHelper({ text }: { text: string }) {
    if (!text) return null
    return (
        <Text testID="opening-date-helper" className="mb-3 mt-1.5 text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

function FieldError({ message, testID }: { message: string; testID: string }) {
    if (!message) return null
    return (
        <Text testID={testID} role="alert" className="text-xs text-danger">
            {message}
        </Text>
    )
}

// The shown text is the default while the stored memo is empty; only a typed
// memo is stored, so the default keeps following the date.
function MemoField({ model }: { model: OpeningForm }) {
    const { field, fieldState } = useController({ name: 'memo', control: model.form.control })
    const placeholderColor = useThemeColor('field-placeholder')
    const border = fieldState.error ? 'border-danger' : 'border-border'
    return (
        <View className="mb-3 gap-1.5">
            <Text className="text-sm font-semibold text-foreground">Memo</Text>
            <RNTextInput
                testID="opening-memo"
                accessibilityLabel="Memo"
                value={model.effectiveMemoText}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholderTextColor={placeholderColor}
                className={`rounded-lg border bg-background px-3 py-2.5 text-base text-foreground ${border}`}
            />
            <FieldError testID="opening-memo-error" message={fieldState.error?.message ?? ''} />
        </View>
    )
}

// Typed as YYYY-MM-DD or picked from core's calendar; either way the date is a custom one.
function BalanceDateField({ model }: { model: OpeningForm }) {
    const { field, fieldState } = useController({ name: 'date', control: model.form.control })
    return (
        <View className="gap-1.5">
            <Text className="text-sm font-semibold text-foreground">Balances at end of day</Text>
            <DateField
                value={field.value || null}
                onChange={next => {
                    field.onChange(next ?? '')
                    model.onDateChange()
                }}
                withTime={false}
                accessibilityLabel="Balances at end of day"
                testID="opening-date"
            />
            <FieldError testID="opening-date-error" message={fieldState.error?.message ?? ''} />
        </View>
    )
}

export function OpeningDateFields({ model }: { model: OpeningForm }) {
    const isWide = useBreakpoint() !== 'mobile'
    const { control } = model.form
    const layout = isWide ? 'flex-row flex-wrap gap-x-4' : ''
    const presetWidth = isWide ? { width: 240 } : undefined
    const dateWidth = isWide ? { width: 220 } : undefined
    return (
        <View className={`border-b border-border px-4 pt-3 ${layout}`}>
            <View style={presetWidth}>
                <SelectInput
                    name="preset"
                    control={control}
                    label="Starting date"
                    options={PRESET_OPTIONS}
                    testID="opening-preset"
                    onValueChange={model.onPresetChange}
                />
            </View>
            <View style={dateWidth}>
                <BalanceDateField model={model} />
                <DateHelper text={model.dateHelper} />
            </View>
            <View className="min-w-[260px] flex-1">
                <MemoField model={model} />
            </View>
        </View>
    )
}
