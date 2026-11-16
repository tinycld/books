import { View } from 'react-native'
import { ALL_VENDORS_TEXT, type PayBillsFormState } from '../../hooks/usePayBillsForm'
import { SearchPicker } from '../SearchPicker'

const WIDTH = { minWidth: 200, maxWidth: 320 }
const ALL_VENDORS = { label: ALL_VENDORS_TEXT, testID: 'pay-bills-vendor-all' }

interface PayBillsVendorFilterProps {
    payForm: PayBillsFormState
    isDisabled: boolean
}

/**
 * The Vendor filter chip (spec §3.3): a vendor SearchPicker over every active vendor and
 * every vendor with an open bill (an inactive one "(inactive)"), "All vendors" first.
 * Screen state (usePayBillsForm's filters), not a form value. Its options come from the vendors
 * read the screen waits on, so it has no loading or error state of its own.
 */
export function PayBillsVendorFilter({ payForm, isDisabled }: PayBillsVendorFilterProps) {
    // `?replaces`: the vendor is the payment's own, so the chip shows it and is fixed.
    const disabled = isDisabled || payForm.isVendorLocked
    return (
        <View style={WIDTH}>
            <SearchPicker
                picker={payForm.vendorPicker}
                title="Vendor"
                triggerLabel={payForm.vendorLabel}
                triggerAccessibilityLabel="Vendor filter"
                triggerTestId="pay-bills-vendor-filter"
                disabled={disabled}
                searchPlaceholder="Search vendors"
                searchTestId="pay-bills-vendor-filter-search"
                options={payForm.vendorPickerOptions}
                optionTestIdPrefix="pay-bills-vendor-option"
                value={payForm.vendorFilter}
                onChange={payForm.onVendorPick}
                noneOption={ALL_VENDORS}
                emptyText="No vendor matches"
            />
        </View>
    )
}
