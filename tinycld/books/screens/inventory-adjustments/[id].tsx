import { useLocalSearchParams } from 'expo-router'
import {
    AdjustmentRouteLoadError,
    AdjustmentScreen,
} from '../../components/inventory-adjustments/AdjustmentScreen'
import { useDocumentRouteId } from '../../hooks/useRouteRecordId'

// An adjustment by its number or its id. A failed read of its number shows the screen's
// load error with Retry.
export default function InventoryAdjustmentRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const route = useDocumentRouteId('books_inventory_adjustments', key)
    if (route.isError) return <AdjustmentRouteLoadError onRetry={route.retry} />
    if (route.id === undefined) return null
    return <AdjustmentScreen key={route.id} id={route.id} />
}
