import { type CustomerFormTarget, useCustomerForm } from '../../hooks/useCustomerForm'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { CUSTOMER_DISCARD_MESSAGE } from '../../lib/customer-messages'
import { useCustomerFormStore } from '../../stores/customer-form-store'
import { RecordChild } from '../RecordChild'

// The open customer, new or existing: the customer's form under the shared record chrome.
export function CustomerChild({ target }: { target: CustomerFormTarget }) {
    const navigation = useCustomerNavigation()
    const state = useCustomerForm(target)
    const editedId = target.mode === 'edit' ? target.record.id : null
    return (
        <RecordChild
            state={state}
            mode={target.mode}
            editedId={editedId}
            testIdPrefix="customer"
            backLabel="Customers"
            discardMessage={CUSTOMER_DISCARD_MESSAGE}
            store={useCustomerFormStore}
            onLeave={navigation.leave}
        />
    )
}
