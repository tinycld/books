import { DocumentListScreen } from '../../components/lists/DocumentListScreen'
import { purchaseTabOf } from '../../lib/purchase-lists'

const ALL_PURCHASES = purchaseTabOf('all')

/**
 * All purchases — `/a/books/purchases`: every bill, expense, bill payment, vendor credit
 * and vendor refund. A document opens at its own kind's route, so it never shows beside
 * this list.
 */
export default function PurchasesScreen() {
    return <DocumentListScreen tab={ALL_PURCHASES} openId="" layout="table" isCovered={false} />
}
