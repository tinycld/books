import { useFocusEffect } from 'expo-router'
import { useLandOnRootRoute } from '../../hooks/useStackScreens'

// The Books root stack's route of All purchases (`books/purchases`).
const ALL_PURCHASES_ROUTE = 'purchases/index'

/**
 * `/a/books/purchase-orders` with no order open lands on All purchases. The purchase lists
 * have no Purchase orders tab yet; when they do, that list takes this route. The move is a
 * stack action in Books' own stack, not a `<Redirect>` (see `screens/index.tsx`): a queued
 * router call could land after the user had moved to another package and pull them back.
 */
export default function PurchaseOrdersIndex() {
    const landOnPurchases = useLandOnRootRoute(ALL_PURCHASES_ROUTE)
    useFocusEffect(landOnPurchases)
    return null
}
