import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { TextInput } from '@tinycld/core/ui/form'
import { X } from 'lucide-react-native'
import { useMemo } from 'react'
import { type Control, useController } from 'react-hook-form'
import { Pressable, Text, View } from 'react-native'
import type { DepositLineFocus } from '../../hooks/useDepositForm'
import { pickerOptionsMatching } from '../../lib/bank-categorize'
import { type DepositAccountRow, otherFundsAccountOptions } from '../../lib/deposit-accounts'
import type { DepositFormValues } from '../../lib/deposit-values'
import { PartyPicker } from '../entries/LinePartyPicker'
import { MoneyTextField } from '../MoneyTextField'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

const ACCOUNT_PLACEHOLDER = 'Account'
const NO_ACCOUNT_TEXT = 'No account to choose'
const REMOVE_SIZE = 44

type LineControl = Control<DepositFormValues>

// The fields every line part reads: the form, the line's index and whether a write runs.
export interface LineFieldProps {
    control: LineControl
    index: number
    isDisabled: boolean
}

// The handlers of the line `id` at `index`, for a table row and a card alike.
export function lineHandlers(lineFocus: DepositLineFocus, id: string, index: number) {
    return {
        onFocus: () => lineFocus.onFocus(id),
        onBlur: () => lineFocus.onBlur(id),
        partyRef: lineFocus.triggerRef(id),
        onNext: () => lineFocus.next(index),
        onRemove: () => lineFocus.removeAt(index),
    }
}

function FieldError({ message, testID }: { message: string | undefined; testID: string }) {
    if (!message) return null
    return (
        <Text testID={testID} className="text-xs text-danger">
            {message}
        </Text>
    )
}

/**
 * A line's Received from: the shared PartyPicker (one active customer or vendor, searched,
 * with None) bound to `lines.<n>.customer` and `.vendor`; a server refusal of either shows
 * under it. `triggerRef` lets the line's focus moves reach the trigger.
 */
export function LinePartyField({
    control,
    index,
    isDisabled,
    triggerRef,
}: LineFieldProps & { triggerRef: (node: unknown) => void }) {
    const customer = useController({ control, name: `lines.${index}.customer` })
    const vendor = useController({ control, name: `lines.${index}.vendor` })
    const message = customer.fieldState.error?.message ?? vendor.fieldState.error?.message
    const onChange = (party: { customer: string; vendor: string }) => {
        customer.field.onChange(party.customer)
        vendor.field.onChange(party.vendor)
    }
    return (
        <View className="min-w-0 gap-1">
            <PartyPicker
                customer={customer.field.value}
                vendor={vendor.field.value}
                onChange={onChange}
                title={`Line ${index + 1} received from`}
                testIdPrefix="deposit-line-party"
                index={index}
                disabled={isDisabled}
                placeholder="Optional"
                triggerRef={triggerRef}
            />
            <FieldError message={message} testID={`deposit-line-party-error-${index}`} />
        </View>
    )
}

/**
 * A line's Account (bank deposit spec §3.5): Books SearchPicker over otherFundsAccountOptions
 * (every active account but Accounts receivable, Accounts payable and the Deposit to
 * account, in chart order and depth), searched by label; typing on the focused trigger
 * opens it. A value the list does not offer (an account made inactive, or chosen in Deposit
 * to since) stays named on the trigger, and its refusal shows under it. The chart is the
 * screen's read, so its loading and its failure are the screen's.
 */
export function LineAccountField({
    control,
    index,
    isDisabled,
    accounts,
    depositTo,
}: LineFieldProps & { accounts: readonly DepositAccountRow[]; depositTo: string }) {
    const picker = useSearchPicker()
    const { field, fieldState } = useController({ control, name: `lines.${index}.account` })
    const value = field.value
    const chart = useMemo(
        () => otherFundsAccountOptions(accounts, depositTo, value),
        [accounts, depositTo, value]
    )
    const options = useMemo(
        () =>
            chart.options.map(option => ({
                id: option.value,
                label: option.label,
                indent: option.indent,
            })),
        [chart.options]
    )
    const shown = pickerOptionsMatching(options, picker.debouncedTerm)
    const chosen = options.find(option => option.id === value)
    const named = chosen?.label ?? chart.triggerLabel
    const label = named || ACCOUNT_PLACEHOLDER
    const title = `Line ${index + 1} account`
    return (
        <View className="min-w-0 gap-1">
            <SearchPicker
                picker={picker}
                title={title}
                triggerLabel={label}
                triggerAccessibilityLabel={`${title}: ${label}`}
                triggerTestId={`deposit-line-account-${index}`}
                isPlaceholder={value === ''}
                disabled={isDisabled}
                searchPlaceholder="Search accounts"
                searchTestId={`deposit-line-account-search-${index}`}
                options={shown}
                optionTestIdPrefix="deposit-line-account-option"
                value={value}
                onChange={field.onChange}
                emptyText={NO_ACCOUNT_TEXT}
            />
            <FieldError
                message={fieldState.error?.message}
                testID={`deposit-line-account-error-${index}`}
            />
        </View>
    )
}

// A line's Description: up to 1000 characters; its error shows under it (core TextInput).
export function LineDescriptionField({ control, index, isDisabled }: LineFieldProps) {
    return (
        <TextInput
            name={`lines.${index}.description`}
            control={control}
            accessibilityLabel={`Line ${index + 1} description`}
            maxLength={1000}
            editable={!isDisabled}
            wrapperProps={{ className: 'min-w-0 gap-1' }}
            testID={`deposit-line-description-${index}`}
        />
    )
}

/**
 * A line's Amount: the Books money field with the "±" sign control (a fee is negative), the
 * danger tone below zero, the whole value selected on focus, and Enter (`onNext`) moving
 * on to the next line. Its error shows under it.
 */
export function LineAmountField({
    control,
    index,
    isDisabled,
    currency,
    onNext,
}: LineFieldProps & { currency: string; onNext: () => void }) {
    const { field, fieldState } = useController({ control, name: `lines.${index}.amount` })
    const number = index + 1
    const signToggle = {
        testID: `deposit-line-sign-${index}`,
        accessibilityLabel: `Change sign for line ${number}`,
        // Spec §3.2 Tab order: Amount → Remove; a keyboard types the minus sign.
        isTabStop: false,
    }
    return (
        <View className="min-w-0 gap-1">
            <MoneyTextField
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                testID={`deposit-line-amount-${index}`}
                accessibilityLabel={`Line ${number} amount`}
                currency={currency}
                editable={!isDisabled}
                signToggle={signToggle}
                marksNegative
                selectsOnFocus
                returnKeyType="next"
                onSubmitEditing={onNext}
            />
            <FieldError
                message={fieldState.error?.message}
                testID={`deposit-line-amount-error-${index}`}
            />
        </View>
    )
}

// "Remove line N": a 44 × 44 press target with the X icon.
export function RemoveLineButton({
    index,
    isDisabled,
    onPress,
}: {
    index: number
    isDisabled: boolean
    onPress: () => void
}) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID={`deposit-line-remove-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove line ${index + 1}`}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            onPress={onPress}
            className="items-center justify-center"
            style={{ width: REMOVE_SIZE, height: REMOVE_SIZE }}
        >
            <X size={18} color={color} />
        </Pressable>
    )
}
