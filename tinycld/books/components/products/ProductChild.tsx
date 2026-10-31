import { type ProductFormTarget, useProductForm } from '../../hooks/useProductForm'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { PRODUCT_DISCARD_MESSAGE } from '../../lib/product-messages'
import { useProductFormStore } from '../../stores/product-form-store'
import { RecordChild } from '../RecordChild'

// The open product, new or existing: the product's form under the shared record chrome.
export function ProductChild({ target }: { target: ProductFormTarget }) {
    const { leave } = useProductNavigation()
    const state = useProductForm(target)
    const editedId = target.mode === 'edit' ? target.record.id : null
    return (
        <RecordChild
            state={state}
            mode={target.mode}
            editedId={editedId}
            testIdPrefix="product"
            backLabel="Products and services"
            discardMessage={PRODUCT_DISCARD_MESSAGE}
            store={useProductFormStore}
            onLeave={leave}
        />
    )
}
