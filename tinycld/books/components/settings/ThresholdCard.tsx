import { Button, ButtonText } from '@tinycld/core/ui/button'
import { FormErrorSummary, TextInput } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import { useThresholdForm } from '../../hooks/useThresholdForm'
import { formatMoney } from '../../lib/money'
import { rootErrorOnly } from '../../lib/root-errors'
import type { BooksSettings } from '../../types'
import { FieldNote, ReadOnlyRow, SectionCard } from './SectionCard'

const THRESHOLD_NOTE =
    'Vendors paid less than this in a calendar year are left out of the 1099 report. Check the IRS instructions for the current amount.'

function ThresholdForm({ settings }: { settings: BooksSettings }) {
    const { form, submit, isPending, isDirty } = useThresholdForm(settings)
    const { control, formState } = form
    const { errors, isSubmitted } = formState
    return (
        <View className="gap-4">
            <View className="w-full max-w-[360px]">
                <TextInput
                    control={control}
                    name="threshold_1099"
                    label="1099 reporting threshold"
                    keyboardType="decimal-pad"
                    testID="books-1099-threshold"
                />
            </View>
            <FieldNote text={THRESHOLD_NOTE} />
            <FormErrorSummary
                testID="books-1099-threshold-errors"
                errors={rootErrorOnly(errors)}
                showFieldNames={false}
                isEnabled={isSubmitted}
            />
            <View className="flex-row">
                <Button
                    testID="books-1099-threshold-save"
                    isDisabled={!isDirty || isPending}
                    onPress={submit}
                >
                    <ButtonText>Save</ButtonText>
                </Button>
            </View>
        </View>
    )
}

function ThresholdBody({ settings, editsThreshold }: ThresholdCardProps) {
    if (editsThreshold) return <ThresholdForm settings={settings} />
    return (
        <ReadOnlyRow
            label="1099 reporting threshold"
            value={formatMoney(settings.threshold_1099, settings.currency)}
            testID="books-1099-threshold-value"
        />
    )
}

interface ThresholdCardProps {
    settings: BooksSettings
    editsThreshold: boolean
}

export function ThresholdCard({ settings, editsThreshold }: ThresholdCardProps) {
    return (
        <SectionCard title="Reporting threshold">
            <ThresholdBody settings={settings} editsThreshold={editsThreshold} />
        </SectionCard>
    )
}
