import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { purchaseTabOf } from '../../lib/purchase-lists'

const TAB = purchaseTabOf('vendor-refunds')

// The Vendor refunds list — `/a/books/vendor-refunds` — with each vendor refund open over
// or beside it.
export default function VendorRefundsLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
