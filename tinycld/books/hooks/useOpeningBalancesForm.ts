import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { dayLabel, effectiveMemo, presetDate } from '../lib/opening-balances'
import {
    type OpeningFormValues,
    type OpeningPreset,
    openingFormSchema,
} from '../lib/opening-balances-schema'
import { todayIso } from '../lib/register-range'
import type { OpeningScreen } from './useOpeningBalancesScreen'

function defaultValues(screen: OpeningScreen, fiscalStartMonth: number): OpeningFormValues {
    if (screen.state.kind === 'draft') {
        const { date, memo } = screen.state.entry
        return { preset: 'custom', date, memo, amounts: {} }
    }
    const date = presetDate('last-fiscal-year', todayIso(), fiscalStartMonth)
    return { preset: 'last-fiscal-year', date, memo: '', amounts: {} }
}

export function useOpeningBalancesForm(screen: OpeningScreen) {
    const closeDate = screen.settings?.closeDate ?? ''
    const fiscalStartMonth = screen.settings?.fiscalStartMonth ?? 1
    const form = useForm<OpeningFormValues>({
        mode: 'onChange',
        resolver: zodResolver(openingFormSchema(closeDate)),
        defaultValues: defaultValues(screen, fiscalStartMonth),
    })
    const [date, memo] = useWatch({ control: form.control, name: ['date', 'memo'] })
    const label = dayLabel(date)

    // SelectInput runs this after the form value changed, and the form value is
    // already typed OpeningPreset, so no string needs narrowing.
    const onPresetChange = () => {
        const preset: OpeningPreset = form.getValues('preset')
        if (preset === 'custom') return
        form.setValue('date', presetDate(preset, todayIso(), fiscalStartMonth), {
            shouldValidate: true,
        })
    }
    const onDateChange = () => form.setValue('preset', 'custom', { shouldDirty: true })

    return {
        form,
        dateHelper: label ? `Balances at end of day ${label}` : '',
        effectiveMemoText: effectiveMemo(memo, date),
        closeDate,
        onPresetChange,
        onDateChange,
    }
}

export type OpeningForm = ReturnType<typeof useOpeningBalancesForm>
