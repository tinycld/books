import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { purchaseTabOf } from '../../lib/purchase-lists'

const TAB = purchaseTabOf('bills')

// The Bills list — `/a/books/bills` — with each bill open over or beside it.
export default function BillsLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
