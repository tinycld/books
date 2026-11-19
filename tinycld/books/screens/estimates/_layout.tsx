import { DocumentKindLayout } from '../../components/lists/DocumentKindLayout'
import { salesTabOf } from '../../lib/sales-lists'

const TAB = salesTabOf('estimates')

// The Estimates list — `/a/books/estimates` — with each estimate open over or beside it.
export default function EstimatesLayout() {
    return <DocumentKindLayout tab={TAB} hasNew />
}
