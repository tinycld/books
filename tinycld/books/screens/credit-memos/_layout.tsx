import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { salesTabOf } from '../../lib/sales-lists'

const TAB = salesTabOf('credit-memos')

// The Credit memos list — `/a/books/credit-memos` — with each credit memo open over or
// beside it.
export default function CreditMemosLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
