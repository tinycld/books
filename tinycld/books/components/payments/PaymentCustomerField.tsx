import { useDocumentCustomerOptions } from '../../hooks/useDocumentCustomerOptions'
import { PAYMENT_FLOW } from '../../lib/payment-flow'
import { useSearchPicker } from '../SearchPicker'
import { PaymentPartyField } from './PaymentPartyField'

interface PaymentCustomerFieldProps {
    value: string
    // The chosen customer's name (read by id, so an inactive stored customer shows).
    name: string
    error: string
    isDisabled: boolean
    // Takes the first focus on web; a correction's locked Customer does not.
    hasFocusOnOpen: boolean
    onPick: (id: string) => void
    // After a pick: focus moves on to Payment date.
    onPicked: () => void
}

const TEXTS = PAYMENT_FLOW.texts

/**
 * Customer: the payment party field over the active customers (sub-customers "Parent:
 * Child"), with the options' loading and failed states. A correction disables it (it
 * keeps its customer); it is never read-only.
 */
export function PaymentCustomerField({
    value,
    name,
    error,
    isDisabled,
    hasFocusOnOpen,
    onPick,
    onPicked,
}: PaymentCustomerFieldProps) {
    const picker = useSearchPicker()
    const customers = useDocumentCustomerOptions(picker.debouncedTerm, picker.isOpen)
    return (
        <PaymentPartyField
            picker={picker}
            options={customers.options}
            isLoading={customers.isLoading}
            loadFailed={customers.loadFailed}
            onRetry={customers.retry}
            title={TEXTS.partyLabel}
            placeholder={TEXTS.partyPlaceholder}
            searchPlaceholder={TEXTS.partySearchPlaceholder}
            emptyText={TEXTS.partyEmpty}
            testId={`${PAYMENT_FLOW.testId}-${PAYMENT_FLOW.ids.party}`}
            value={value}
            name={name}
            error={error}
            isDisabled={isDisabled}
            isReadOnly={false}
            hasFocusOnOpen={hasFocusOnOpen}
            onPick={onPick}
            onPicked={onPicked}
        />
    )
}
