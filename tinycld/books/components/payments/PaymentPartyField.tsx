import { Platform } from 'react-native'
import { SearchPicker, type SearchPickerOption, type useSearchPicker } from '../SearchPicker'
import { FieldError } from './PaymentMoneyField'

export interface PaymentPartyFieldProps {
    picker: ReturnType<typeof useSearchPicker>
    // The flow's party options for `picker.debouncedTerm`, and their read's state.
    options: readonly SearchPickerOption[]
    isLoading: boolean
    loadFailed: boolean
    onRetry: () => void
    title: string
    // The trigger's text while no party is chosen.
    placeholder: string
    searchPlaceholder: string
    emptyText: string
    // The trigger's id; `<testId>-search`, `<testId>-option-<id>` and `<testId>-error`.
    testId: string
    value: string
    // The chosen party's name (read by id, so an inactive stored party shows).
    name: string
    error: string
    isDisabled: boolean
    // Focusable but never opens (a correction keeps its party; spec §3.6).
    isReadOnly: boolean
    // Takes the first focus on web.
    hasFocusOnOpen: boolean
    onPick: (id: string) => void
    // After a pick: focus moves on to the next field.
    onPicked: () => void
}

const AUTO_FOCUS = Platform.OS === 'web'

/**
 * A payment form's party field: Books SearchPicker over the options the flow's screen
 * read, with their loading and failed states, and the field's error under it. It has
 * focus on open, on web, when `hasFocusOnOpen` is true.
 */
export function PaymentPartyField({
    picker,
    options,
    isLoading,
    loadFailed,
    onRetry,
    title,
    placeholder,
    searchPlaceholder,
    emptyText,
    testId,
    value,
    name,
    error,
    isDisabled,
    isReadOnly,
    hasFocusOnOpen,
    onPick,
    onPicked,
}: PaymentPartyFieldProps) {
    const label = name || placeholder
    return (
        <>
            <SearchPicker
                picker={picker}
                title={title}
                triggerLabel={label}
                triggerAccessibilityLabel={`${title}: ${label}`}
                triggerTestId={testId}
                isPlaceholder={value === ''}
                disabled={isDisabled}
                isReadOnly={isReadOnly}
                searchPlaceholder={searchPlaceholder}
                searchTestId={`${testId}-search`}
                options={options}
                optionTestIdPrefix={`${testId}-option`}
                value={value}
                onChange={onPick}
                isLoading={isLoading}
                loadFailed={loadFailed}
                onRetry={onRetry}
                emptyText={emptyText}
                autoFocus={AUTO_FOCUS && hasFocusOnOpen}
                onPicked={onPicked}
            />
            <FieldError message={error} testID={`${testId}-error`} />
        </>
    )
}
