import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { useCallback, useMemo, useRef } from 'react'
import type { TextInput } from 'react-native'
import {
    buildOpening,
    centsFromAmounts,
    dayLabel,
    effectiveMemo,
    type OpeningBand,
    type OpeningGroup,
    type OpeningRow,
    presetDate,
} from '../lib/opening-balances'
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

export type GridItem =
    | { kind: 'band'; band: OpeningBand; subtotal: number }
    | { kind: 'row'; row: OpeningRow; group: OpeningGroup }

export function gridItems(
    bands: readonly OpeningBand[],
    totals: Record<OpeningGroup, number>
): GridItem[] {
    return bands.flatMap((band): GridItem[] => [
        { kind: 'band', band, subtotal: totals[band.group] },
        ...band.rows.map((row): GridItem => ({ kind: 'row', row, group: band.group })),
    ])
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

    // No React compiler in this repo, so the derived grid data is memoized by hand:
    // a keystroke in one amount must not rebuild the whole item list.
    const amounts = useWatch({ control: form.control, name: 'amounts' })
    const cents = useMemo(() => centsFromAmounts(amounts), [amounts])
    const build = useMemo(() => buildOpening(screen.accounts, cents), [screen.accounts, cents])
    const items = useMemo(
        () =>
            gridItems(screen.bands, {
                asset: build.totals.assets,
                liability: build.totals.liabilities,
                equity: build.totals.equity,
            }),
        [screen.bands, build]
    )

    const inputs = useRef(new Map<string, TextInput>())
    const refCallbacks = useRef(new Map<string, (node: TextInput | null) => void>())
    const registerInput = useCallback((accountId: string, node: TextInput | null) => {
        if (node) inputs.current.set(accountId, node)
        else inputs.current.delete(accountId)
    }, [])
    // One callback per account for the life of the form, so React does not detach and
    // re-attach every input ref on each render.
    const inputRefFor = useCallback(
        (accountId: string) => {
            const known = refCallbacks.current.get(accountId)
            if (known) return known
            const callback = (node: TextInput | null) => registerInput(accountId, node)
            refCallbacks.current.set(accountId, callback)
            return callback
        },
        [registerInput]
    )
    const rowIds = useMemo(
        () => screen.bands.flatMap(band => band.rows.map(row => row.account.id)),
        [screen.bands]
    )
    const focusNext = (accountId: string) => {
        const nextId = rowIds[rowIds.indexOf(accountId) + 1]
        const next = nextId === undefined ? undefined : inputs.current.get(nextId)
        if (next) next.focus()
        else inputs.current.get(accountId)?.blur()
    }

    return {
        form,
        cents,
        build,
        items,
        focusNext,
        registerInput,
        inputRefFor,
        dateHelper: label ? `Balances at end of day ${label}` : '',
        effectiveMemoText: effectiveMemo(memo, date),
        closeDate,
        onPresetChange,
        onDateChange,
    }
}

export type OpeningForm = ReturnType<typeof useOpeningBalancesForm>
