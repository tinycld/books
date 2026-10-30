import {
    type Control,
    type FieldErrors,
    useForm,
    useWatch,
    zodResolver,
} from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import type {
    PeriodPreset,
    ReportOptions,
    ReportPeriod,
    ReportSpec,
} from '../lib/report-definition'
import {
    formValuesFromOptions,
    optionsFromFormValues,
    type ReportFormValues,
    reportDefaults,
    reportFormSchema,
    serializeReportParams,
} from '../lib/report-options'
import { type PeriodContext, resolvePreset } from '../lib/report-period'

export type ReportOptionsForm = {
    control: Control<ReportFormValues>
    errors: FieldErrors<ReportFormValues>
    preset: PeriodPreset
    pendingFrom: string | null
    pendingTo: string | null
    onPreset(preset: PeriodPreset): void
    onDateChange(field: 'from' | 'to', value: string | null): void
    onOptionChange(): void
    applyFilters(filters: Record<string, string[]>): void
    discardEdit(): void
    reset(): void
}

// Null for `custom`, which keeps the typed dates, and for a preset the report does not list.
function resolveListed(
    period: ReportSpec['period'],
    preset: PeriodPreset,
    context: PeriodContext
): ReportPeriod | null {
    if (period.kind === 'range') {
        const found = period.presets.find(id => id === preset)
        if (!found || found === 'custom') return null
        return resolvePreset(found, 'range', context)
    }
    const found = period.presets.find(id => id === preset)
    if (!found || found === 'custom') return null
    return resolvePreset(found, 'as-of', context)
}

// The form holds what the user is editing, including an invalid typed date; the URL holds the
// last valid options. Every change handler writes the URL, and only when the whole form is
// valid, so no effect ever syncs the two.
export function useReportOptionsForm(input: {
    definition: ReportSpec
    options: ReportOptions
    context: PeriodContext
}): ReportOptionsForm {
    const { definition, options, context } = input
    const schema = reportFormSchema(definition)
    const form = useForm<ReportFormValues>({
        resolver: zodResolver(schema),
        mode: 'onChange',
        defaultValues: formValuesFromOptions(definition, options),
    })
    const { control, setValue } = form
    const [preset, typedFrom, typedTo] = useWatch({ control, name: ['preset', 'from', 'to'] })

    // A named preset is stored by name and resolved again on every render, so its dates come
    // from the options: a day rollover or a fiscal start change never shows a stale date.
    const shown = preset === 'custom' ? { from: typedFrom, to: typedTo } : options.period

    // setParams replaces the history entry, so an option change adds none.
    const write = form.handleSubmit(values =>
        router.setParams(
            serializeReportParams(definition, optionsFromFormValues(definition, values, context))
        )
    )

    // Custom starts from the dates a named preset shows; an existing Custom keeps its typed dates.
    const startCustom = () => {
        if (form.getValues('preset') !== 'custom') {
            setValue('from', options.period.from)
            setValue('to', options.period.to)
        }
        setValue('preset', 'custom')
    }

    const onPreset = (next: PeriodPreset) => {
        if (next === 'custom') {
            startCustom()
        } else {
            setValue('preset', next)
            const resolved = resolveListed(definition.period, next, context)
            if (resolved) {
                setValue('from', resolved.from)
                setValue('to', resolved.to)
            }
        }
        void write()
    }

    // write() validates the whole form once, so the date is set without its own validation.
    const onDateChange = (field: 'from' | 'to', value: string | null) => {
        startCustom()
        setValue(field, value)
        void write()
    }

    const applyFilters = (filters: Record<string, string[]>) => {
        setValue('filters', filters)
        void write()
    }

    // Invalid current values are reset to the URL's options, which are the last valid ones. Valid
    // values are kept: their URL write is in flight or done, and `options` can lag it until the
    // next render. The check reads the current values, not the render-time error snapshot, so an
    // edit made in the same tick is judged correctly.
    const discardEdit = () => {
        if (!schema.safeParse(form.getValues()).success) {
            form.reset(formValuesFromOptions(definition, options))
        }
    }

    const reset = () => {
        const defaults = reportDefaults(definition, context)
        form.reset(formValuesFromOptions(definition, defaults))
        router.setParams(serializeReportParams(definition, defaults))
    }

    return {
        control,
        errors: form.formState.errors,
        preset,
        pendingFrom: shown.from,
        pendingTo: shown.to,
        onPreset,
        onDateChange,
        onOptionChange: () => void write(),
        applyFilters,
        discardEdit,
        reset,
    }
}
