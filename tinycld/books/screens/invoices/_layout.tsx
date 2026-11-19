import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { salesTabOf } from '../../lib/sales-lists'

const TAB = salesTabOf('invoices')

// The Invoices list — `/a/books/invoices` — with each invoice open over or beside it.
export default function InvoicesLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
