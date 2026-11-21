import { useCallback } from 'react'
import { Text, View } from 'react-native'
import { useAskedFocus } from '../../../hooks/useBankCategorize'
import { pickerOptionsMatching } from '../../../lib/bank-categorize'
import { SearchPicker, type SearchPickerOption, useSearchPicker } from '../../SearchPicker'

const PLACEHOLDER = 'Choose an account'

const focusNode = (node: HTMLElement) => node.focus()

type PickerState = { isLoading: boolean; loadFailed: boolean; emptyText: string | undefined }

type CategorizeAccountPickerProps = {
    label: string
    testID: string
    value: string
    onChange: (id: string) => void
    // The field's error (a server refusal that names this account), drawn under it.
    errorText?: string
    options: readonly SearchPickerOption[]
    state: PickerState
    onRetry: () => void
    isDisabled: boolean
    // This picker takes the focus the store asks for (an open, C or T, the next row).
    takesFocus: boolean
    // The pick moves the focus on (to Memo, or to a split line's Amount).
    onPicked?: () => void
    // The form field's ref (useController), so the form can move the focus here.
    fieldRef?: (instance: unknown) => void
}

function FieldError({ text, testID }: { text?: string; testID: string }) {
    if (!text) return null
    return (
        <Text testID={testID} className="text-xs text-danger">
            {text}
        </Text>
    )
}

// The account picker of the Categorize and Transfer ways: Books SearchPicker over the
// options the pure helpers built (grouped by type, sub-accounts indented), searched on the
// client by label; the loading row while the accounts load, the "could not load" row with
// Retry after a failed read, the empty text when no account is left to choose. Typing on
// the focused trigger opens it with the typed text (typeToOpen).
export function CategorizeAccountPicker({
    label,
    testID,
    value,
    onChange,
    errorText,
    options,
    state,
    onRetry,
    isDisabled,
    takesFocus,
    onPicked,
    fieldRef,
}: CategorizeAccountPickerProps) {
    const picker = useSearchPicker()
    const askedRef = useAskedFocus(takesFocus, focusNode)
    const triggerRef = useCallback(
        (instance: unknown) => {
            askedRef(instance)
            fieldRef?.(instance)
        },
        [askedRef, fieldRef]
    )
    const shown = pickerOptionsMatching(options, picker.debouncedTerm)
    const chosen = options.find(option => option.id === value)
    const triggerLabel = chosen?.label ?? PLACEHOLDER
    return (
        <View className="gap-1.5">
            <Text className="text-sm font-semibold text-foreground">{label}</Text>
            <SearchPicker
                picker={picker}
                title={label}
                triggerLabel={triggerLabel}
                triggerAccessibilityLabel={`${label}: ${triggerLabel}`}
                triggerTestId={testID}
                isPlaceholder={!chosen}
                disabled={isDisabled}
                searchPlaceholder="Search accounts"
                searchTestId={`${testID}-search`}
                options={shown}
                optionTestIdPrefix={`${testID}-option`}
                value={value}
                onChange={onChange}
                isLoading={state.isLoading}
                loadFailed={state.loadFailed}
                onRetry={onRetry}
                emptyText={state.emptyText}
                triggerRef={triggerRef}
                onPicked={onPicked}
            />
            <FieldError text={errorText} testID={`${testID}-error`} />
        </View>
    )
}
