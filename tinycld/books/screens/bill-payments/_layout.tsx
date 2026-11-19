import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { purchaseTabOf } from '../../lib/purchase-lists'

const TAB = purchaseTabOf('bill-payments')

// The Bill payments list — `/a/books/bill-payments` — with each bill payment open over or
// beside it. A bill payment is made on Pay Bills, a screen of the Books root stack, so the
// child stack has no `new` screen.
export default function BillPaymentsLayout() {
    return <DocumentKindLayout tab={TAB} hasNew={false} />
}
