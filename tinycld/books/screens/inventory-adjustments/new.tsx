import { AdjustmentScreen } from '../../components/inventory-adjustments/AdjustmentScreen'

// A new inventory adjustment. A reader gets the no-access notice; a writer gets the
// not-found page until checkpoint 4 gives the screen its form (no link leads here yet).
export default function NewInventoryAdjustmentRoute() {
    return <AdjustmentScreen />
}
