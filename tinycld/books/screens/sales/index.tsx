import { DocumentListScreen } from '../../components/lists/DocumentListScreen'
import { salesTabOf } from '../../lib/sales-lists'

const ALL_SALES = salesTabOf('all')

/**
 * All sales — `/a/books/sales`: every invoice, estimate, sales receipt, payment and credit
 * memo. A document opens at its own kind's route, so it never shows beside this list.
 */
export default function SalesScreen() {
    return <DocumentListScreen tab={ALL_SALES} openId="" layout="table" isCovered={false} />
}
