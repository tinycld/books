import { Stack } from 'expo-router'

// The purchase order screens (`new`, `[id]`) in their own stack. The Purchase orders list
// tab, and with it the kind's list layout, comes with the purchase lists.
export default function PurchaseOrdersLayout() {
    return <Stack screenOptions={STACK_OPTIONS} />
}

const STACK_OPTIONS = { headerShown: false }
