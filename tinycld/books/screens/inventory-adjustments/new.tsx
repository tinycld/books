import { useLocalSearchParams } from 'expo-router'
import { AdjustmentScreen } from '../../components/inventory-adjustments/AdjustmentScreen'

// A new inventory adjustment; `product` starts it with one line of that item. `fresh` is a
// new key for each Post & new, so the next form mounts blank (and the Date takes the focus
// again); the key also follows `product`. A reader gets the no-access notice.
export default function NewInventoryAdjustmentRoute() {
    const params = useLocalSearchParams<{ product?: string; fresh?: string }>()
    const key = [params.fresh, params.product].join('|')
    return <AdjustmentScreen key={key} product={params.product} />
}
