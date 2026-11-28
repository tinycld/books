import { useLocalSearchParams } from 'expo-router'
import { AdjustmentScreen } from '../../components/inventory-adjustments/AdjustmentScreen'

// A new inventory adjustment; `product` starts it with one line of that item, `copy` from
// another adjustment, and `replaces` is the correction of a posted one. `fresh` is a new
// key for each Post & new, so the next form mounts blank (and the Date takes the focus
// again); the key also follows the other params. A reader gets the no-access notice.
export default function NewInventoryAdjustmentRoute() {
    const params = useLocalSearchParams<{
        product?: string
        copy?: string
        replaces?: string
        fresh?: string
    }>()
    const key = [params.fresh, params.product, params.copy, params.replaces].join('|')
    return (
        <AdjustmentScreen
            key={key}
            product={params.product}
            copy={params.copy}
            replaces={params.replaces}
        />
    )
}
