import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { purchaseTabOf } from '../../lib/purchase-lists'

const TAB = purchaseTabOf('vendor-credits')

// The Vendor credits list — `/a/books/vendor-credits` — with each vendor credit open over
// or beside it.
export default function VendorCreditsLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
