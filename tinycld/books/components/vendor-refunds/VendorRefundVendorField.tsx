import { useVendorOptions } from '../../forms/document-fields'
import { VENDOR_REFUND_FLOW } from '../../lib/vendor-refund-flow'
import { PaymentPartyField } from '../payments/PaymentPartyField'
import { useSearchPicker } from '../SearchPicker'

interface VendorRefundVendorFieldProps {
    value: string
    // The chosen vendor's name, read by id, so an inactive stored vendor shows by name.
    name: string
    error: string
    isDisabled: boolean
    // A correction keeps its vendor (spec §3.6): the trigger takes focus but never opens.
    isReadOnly: boolean
    onPick: (id: string) => void
    // After a pick: focus moves on to Refund date.
    onPicked: () => void
}

const FLOW = VENDOR_REFUND_FLOW
// No stored vendor joins the options: a refund may name only an active vendor (the server
// refuses an inactive one), so an inactive stored vendor shows in the trigger only.
const NO_STORED_VENDOR = ''

/**
 * Vendor (vendor refund spec §3.3): the payment party field over the bill form's vendor
 * options (active vendors by name), with that read's loading, failed-with-Retry and
 * no-match states. It takes the first focus on web on every form (new, draft, correction).
 */
export function VendorRefundVendorField({
    value,
    name,
    error,
    isDisabled,
    isReadOnly,
    onPick,
    onPicked,
}: VendorRefundVendorFieldProps) {
    const picker = useSearchPicker()
    const vendors = useVendorOptions(picker.debouncedTerm, picker.isOpen, NO_STORED_VENDOR)
    return (
        <PaymentPartyField
            picker={picker}
            options={vendors.options}
            isLoading={vendors.isLoading}
            loadFailed={vendors.loadFailed}
            onRetry={vendors.retry}
            title={FLOW.texts.partyLabel}
            placeholder={FLOW.texts.partyPlaceholder}
            searchPlaceholder={FLOW.texts.partySearchPlaceholder}
            emptyText={vendors.emptyText}
            testId={`${FLOW.testId}-${FLOW.ids.party}`}
            value={value}
            name={name}
            error={error}
            isDisabled={isDisabled}
            isReadOnly={isReadOnly}
            hasFocusOnOpen
            onPick={onPick}
            onPicked={onPicked}
        />
    )
}
