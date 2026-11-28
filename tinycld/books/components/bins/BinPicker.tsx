import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo } from 'react'
import type { PressableInstance } from 'react-native'
import { useActiveBins } from '../../hooks/useActiveBins'
import { pickerOptionsMatching } from '../../lib/bank-categorize'
import { NO_BIN, NO_BIN_LABEL } from '../../lib/inventory-adjust-fixture'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

// The chosen bin by id, inactive ones too, with its load error (useRecord has none): the
// trigger names a stored bin that became inactive, with " (inactive)", until it is changed.
function useChosenBin(id: string) {
    const [binsCollection] = useStore('books_bins')
    const query = useLiveQuery({
        query: q =>
            id
                ? q
                      .from({ bin: binsCollection })
                      .where(({ bin }) => eq(bin.id, id))
                      .select(({ bin }) => ({ name: bin.name, inactive: bin.inactive }))
                      .findOne()
                : null,
        queryKey: ['books.bins.chosen', id],
    })
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [binsCollection],
            onError: err => log.error('books.bins.chosen', err),
        })
    }
    return { bin: query.data, isLoading: query.isLoading, isError: query.isError, retry }
}

type ChosenBin = ReturnType<typeof useChosenBin>

// The trigger's text: "No bin" for no bin; `…` while the chosen row loads; "Unknown bin"
// when its read failed or the bin is gone (the id is kept).
function chosenNameOf(value: string, chosen: ChosenBin): string {
    if (value === NO_BIN) return NO_BIN_LABEL
    if (chosen.bin) return chosen.bin.name
    if (chosen.isError) return 'Unknown bin'
    return chosen.isLoading ? '…' : 'Unknown bin'
}

interface BinPickerProps {
    // The bin location id; '' is No bin.
    value: string
    onChange: (id: string) => void
    testID: string
    disabled: boolean
    autoFocus?: boolean
    // The trigger's accessible name, such as the line's number and the column.
    label?: string
    // A table cell's focus ref and its row's focus notes.
    triggerRef?: (node: PressableInstance | null) => void
    onFocus?: () => void
    onBlur?: () => void
}

/**
 * A searchable menu of the active bin locations by name, with "No bin" above them
 * (inventory-adjust spec §3.3, §3.7). The trigger names the chosen bin, with "(inactive)"
 * for a stored bin that was made inactive since (kept until it is changed). The list loads
 * with "Loading…", and a failed read of it or of the chosen bin shows "Could not load."
 * with Retry in the menu.
 */
export function BinPicker({
    value,
    onChange,
    testID,
    disabled,
    autoFocus = false,
    label = 'Bin',
    triggerRef,
    onFocus,
    onBlur,
}: BinPickerProps) {
    const picker = useSearchPicker()
    const active = useActiveBins()
    const chosen = useChosenBin(value)
    const options = useMemo(
        () => active.bins.map(bin => ({ id: bin.id, label: bin.name })),
        [active.bins]
    )
    const shown = pickerOptionsMatching(options, picker.debouncedTerm)
    const chosenName = chosenNameOf(value, chosen)
    const suffix = chosen.bin?.inactive ? '(inactive)' : undefined
    const noneOption = { label: NO_BIN_LABEL, testID: `${testID}-none` }
    const retry = () => {
        if (active.isError) active.retry()
        if (chosen.isError) chosen.retry()
    }
    return (
        <SearchPicker
            picker={picker}
            title="Bin location"
            triggerLabel={chosenName}
            triggerSuffix={suffix}
            triggerAccessibilityLabel={`${label}: ${chosenName}`}
            triggerTestId={testID}
            disabled={disabled}
            searchPlaceholder="Search bin locations"
            searchTestId={`${testID}-search`}
            options={shown}
            optionTestIdPrefix={`${testID}-option`}
            value={value}
            onChange={onChange}
            noneOption={noneOption}
            isLoading={active.isLoading}
            loadFailed={active.isError || chosen.isError}
            onRetry={retry}
            emptyText="No bin location matches"
            autoFocus={autoFocus}
            triggerRef={triggerRef}
            onTriggerFocus={onFocus}
            onTriggerBlur={onBlur}
        />
    )
}
