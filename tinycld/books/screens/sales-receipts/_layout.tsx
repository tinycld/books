import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { salesTabOf } from '../../lib/sales-lists'

const TAB = salesTabOf('sales-receipts')

// The Sales receipts list — `/a/books/sales-receipts` — with each sales receipt open over
// or beside it.
export default function SalesReceiptsLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
