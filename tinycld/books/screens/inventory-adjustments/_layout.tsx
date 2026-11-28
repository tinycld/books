import { AdjustmentsList } from '../../components/inventory-adjustments/AdjustmentsList'
import { ListDetailLayout } from '../../components/ListDetailLayout'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { ADJUSTMENTS_PATH } from '../../lib/adjustment-route'
import { RECORD_DETAIL_SCREENS } from '../../lib/record-route'

/**
 * The inventory adjustments list — `/a/books/inventory-adjustments` — and the adjustment
 * open over or beside it.
 *
 * The list renders here, once, so its query, scroll position, search text and chips stay
 * while adjustments open and close in the child stack. The open adjustment is read from
 * the URL, never from a store.
 */
export default function InventoryAdjustmentsLayout() {
    const { open, openId } = useOpenRecord(ADJUSTMENTS_PATH)
    return (
        <ListDetailLayout
            list={<AdjustmentsList openId={openId} />}
            isDetailOpen={open.kind !== 'none'}
            detailScreens={RECORD_DETAIL_SCREENS}
            detailWidth="record"
        />
    )
}
