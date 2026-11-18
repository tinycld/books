import { Stack } from 'expo-router'
import { KindStackContext, useKindStackValue } from '../../components/lists/kind-stack-context'

// The refund receipts' route — `/a/books/refund-receipts` — with each refund receipt in a
// plain child stack. It has no list yet (index.tsx lands on the Sales list). The layout is
// a screen of the Books root stack, so it reads the screen below it there and hands it to
// the child stack's screens (KindStackContext): Back from a refund pops to the screen it
// was opened from, as from a sales kind's documents.
export default function RefundReceiptsLayout() {
    const kindStack = useKindStackValue('refund-receipts')
    return (
        <KindStackContext.Provider value={kindStack}>
            <Stack screenOptions={{ headerShown: false }} />
        </KindStackContext.Provider>
    )
}
