import type { ReactNode } from 'react'
import { View } from 'react-native'

// Spec §3.2: the column is at most 560 px wide. The class form (max-w-[560px]) did not cap
// the column inside the ScrollView's content container, so the cap is a style.
const COLUMN_WIDTH = { maxWidth: 560 }

// The centered column of the customer's page: the card and the line under it.
export function PublicEstimateFrame({ children }: { children: ReactNode }) {
    return (
        <View className="w-full gap-4" style={COLUMN_WIDTH}>
            {children}
        </View>
    )
}

// The card surface every state of the page draws in.
export function PublicCardSurface({ testID, children }: { testID: string; children: ReactNode }) {
    return (
        <View testID={testID} className="w-full gap-5 rounded-xl border border-border bg-card p-6">
            {children}
        </View>
    )
}
