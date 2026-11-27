import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { purchaseTabOf } from '../../lib/purchase-lists'

const TAB = purchaseTabOf('purchase-orders')

// The Purchase orders list — `/a/books/purchase-orders` — with each order open over or
// beside it.
export default function PurchaseOrdersLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
