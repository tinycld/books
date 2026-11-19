import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { salesTabOf } from '../../lib/sales-lists'

const TAB = salesTabOf('refund-receipts')

// The Refund receipts list — `/a/books/refund-receipts` — with each refund receipt open
// over or beside it.
export default function RefundReceiptsLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
