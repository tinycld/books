import { ButtonGroup, type Control } from '@tinycld/core/ui/form'
import { View } from 'react-native'
import type { ReportFormValues } from '../../lib/report-options'

const METHOD_OPTIONS = [
    { value: 'accrual', label: 'Accrual' },
    { value: 'cash', label: 'Cash' },
]

// ButtonGroup sets the field itself; onValueChange then writes the options to the URL.
export function ReportMethodToggle({
    control,
    onValueChange,
}: {
    control: Control<ReportFormValues>
    onValueChange: () => void
}) {
    return (
        <View testID="report-method">
            <ButtonGroup
                name="basis"
                control={control}
                label="Method"
                hideLabel
                horizontal
                options={METHOD_OPTIONS}
                onValueChange={onValueChange}
                wrapperProps={{ className: '' }}
            />
        </View>
    )
}
