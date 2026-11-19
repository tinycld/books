import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { purchaseTabOf } from '../../lib/purchase-lists'

const TAB = purchaseTabOf('expenses')

// The Expenses list — `/a/books/expenses` — with each expense open over or beside it.
export default function ExpensesLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
