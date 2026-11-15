import { Platform } from 'react-native'
import { useDocumentCustomerOptions } from '../../hooks/useDocumentCustomerOptions'
import { SearchPicker, useSearchPicker } from '../SearchPicker'
import { FieldError } from './PaymentMoneyField'

interface PaymentCustomerFieldProps {
    value: string
    // The chosen customer's name (read by id, so an inactive stored customer shows).
    name: string
    error: string
    isDisabled: boolean
    onPick: (id: string) => void
    // After a pick: focus moves on to Payment date.
    onPicked: () => void
}

const AUTO_FOCUS = Platform.OS === 'web'

/**
 * Customer: Books SearchPicker over the active customers (sub-customers "Parent:
 * Child"), with the options' loading and failed states. It has focus on open, on web.
 */
export function PaymentCustomerField({
    value,
    name,
    error,
    isDisabled,
    onPick,
    onPicked,
}: PaymentCustomerFieldProps) {
    const picker = useSearchPicker()
    const customers = useDocumentCustomerOptions(picker.debouncedTerm, picker.isOpen)
    const label = name || 'Choose a customer'
    return (
        <>
            <SearchPicker
                picker={picker}
                title="Customer"
                triggerLabel={label}
                triggerAccessibilityLabel={`Customer: ${label}`}
                triggerTestId="payment-customer"
                isPlaceholder={value === ''}
                disabled={isDisabled}
                searchPlaceholder="Search customers"
                searchTestId="payment-customer-search"
                options={customers.options}
                optionTestIdPrefix="payment-customer-option"
                value={value}
                onChange={onPick}
                isLoading={customers.isLoading}
                loadFailed={customers.loadFailed}
                onRetry={customers.retry}
                emptyText="No active customer matches"
                autoFocus={AUTO_FOCUS}
                onPicked={onPicked}
            />
            <FieldError message={error} testID="payment-customer-error" />
        </>
    )
}
