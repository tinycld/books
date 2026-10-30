import { useVendorForm, type VendorFormTarget } from '../../hooks/useVendorForm'
import { useVendorNavigation } from '../../hooks/useVendorNavigation'
import { VENDOR_DISCARD_MESSAGE } from '../../lib/vendor-messages'
import { useVendorFormStore } from '../../stores/vendor-form-store'
import { RecordChild } from '../RecordChild'

// The open vendor, new or existing: the vendor's form under the shared record chrome.
export function VendorChild({ target }: { target: VendorFormTarget }) {
    const { leave } = useVendorNavigation()
    const state = useVendorForm(target)
    const editedId = target.mode === 'edit' ? target.record.id : null
    return (
        <RecordChild
            state={state}
            mode={target.mode}
            editedId={editedId}
            testIdPrefix="vendor"
            backLabel="Vendors"
            discardMessage={VENDOR_DISCARD_MESSAGE}
            store={useVendorFormStore}
            onLeave={leave}
        />
    )
}
