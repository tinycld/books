import { Text, View } from 'react-native'

interface TaxBadgeProps {
    isVisible: boolean
    label: 'Default' | 'Inactive'
    tone: 'accent' | 'muted'
    testID: string
}

// The accent fill alone matches the card's surface in light mode; the edge keeps the
// pill visible in both themes (as the Books access chip does).
const TONES = {
    accent: { box: 'border border-border bg-accent', text: 'text-accent-foreground' },
    muted: { box: 'border border-border', text: 'text-muted-foreground' },
} as const

export function TaxBadge({ isVisible, label, tone, testID }: TaxBadgeProps) {
    if (!isVisible) return null
    const { box, text } = TONES[tone]
    return (
        <View testID={testID} className={`shrink-0 rounded-full px-2 py-0.5 ${box}`}>
            <Text className={`text-xs font-medium ${text}`}>{label}</Text>
        </View>
    )
}
