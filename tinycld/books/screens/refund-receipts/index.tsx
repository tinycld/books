import { useFocusEffect } from 'expo-router'
import { useLandOnRootRoute } from '../../hooks/useStackScreens'

/**
 * The bare `/a/books/refund-receipts` lands on the All sales list until refund receipts
 * have a list of their own. As screens/index.tsx, the move is a stack action of Books' own
 * stack, not a global `<Redirect>`, which could land after the user had moved to another
 * package.
 */
export default function RefundReceiptsIndex() {
    const landOnSales = useLandOnRootRoute('sales/index')
    useFocusEffect(landOnSales)
    return null
}
