import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { salesTabOf } from '../../lib/sales-lists'

const TAB = salesTabOf('payments')

// The Payments list — `/a/books/payments` — with each payment open over or beside it.
export default function PaymentsLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
