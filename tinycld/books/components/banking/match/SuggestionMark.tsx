import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { AlertTriangle, Check } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { RowSuggestion } from '../../../hooks/useMatchSuggestions'
import { suggestionText } from '../../../lib/bank-match'

const CHIP_STYLE = { minHeight: 20 }

// The icons are decoration: the text beside them carries the meaning.
function HiddenIcon({ children }: { children: ReactNode }) {
    return (
        <View aria-hidden accessibilityElementsHidden importantForAccessibility="no">
            {children}
        </View>
    )
}

function OneMatchMark({ txnId, text }: { txnId: string; text: string }) {
    const color = useThemeColor('success')
    return (
        <View className="min-w-0 flex-shrink flex-row items-center gap-1">
            <HiddenIcon>
                <Check size={14} color={color} />
            </HiddenIcon>
            <Text
                testID={`bank-review-suggestion-${txnId}`}
                numberOfLines={1}
                className="flex-1 text-xs text-primary"
            >
                {text}
            </Text>
        </View>
    )
}

function ManyMatchesMark({ txnId, text }: { txnId: string; text: string }) {
    const color = useThemeColor('warning')
    return (
        <View
            className="flex-row items-center gap-1 self-start rounded-full border border-warning px-2"
            style={CHIP_STYLE}
        >
            <HiddenIcon>
                <AlertTriangle size={12} color={color} />
            </HiddenIcon>
            <Text testID={`bank-review-matches-${txnId}`} className="text-xs text-foreground">
                {text}
            </Text>
        </View>
    )
}

// A For review row's mark: a green check and the suggestion for exactly one, a chip with a
// warning triangle for several, nothing for none (the row then keeps its memo line).
export function SuggestionMark({
    txnId,
    suggestions,
    form,
}: {
    txnId: string
    suggestions: readonly RowSuggestion[]
    form: 'row' | 'card'
}) {
    if (suggestions.length === 0) return null
    const text = suggestionText(suggestions.length, suggestions[0]?.entry, form)
    if (suggestions.length === 1) return <OneMatchMark txnId={txnId} text={text} />
    return <ManyMatchesMark txnId={txnId} text={text} />
}
