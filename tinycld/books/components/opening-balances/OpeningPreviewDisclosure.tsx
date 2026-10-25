import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { type ReactNode, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

interface OpeningPreviewDisclosureProps {
    title: string
    children: ReactNode
    testID: string
    toggleTestID: string
}

function Content({
    isVisible,
    testID,
    children,
}: {
    isVisible: boolean
    testID: string
    children: ReactNode
}) {
    if (!isVisible) return null
    return (
        <ScrollView testID={testID} style={{ flexShrink: 1 }}>
            {children}
        </ScrollView>
    )
}

// The open region may take this share of the body (its parent), so the grid always
// keeps the rest. A percentage resolves against the bounded body, with no measuring.
const OPEN_MAX_HEIGHT = '35%'

// Core has no disclosure primitive. The open flag is local: nothing else reads it.
export function OpeningPreviewDisclosure({
    title,
    children,
    testID,
    toggleTestID,
}: OpeningPreviewDisclosureProps) {
    const [expanded, setExpanded] = useState(false)
    const color = useThemeColor('muted-foreground')
    const Chevron = expanded ? ChevronDown : ChevronRight
    return (
        <View
            className="shrink overflow-hidden border-t border-border bg-surface-secondary"
            style={expanded ? { maxHeight: OPEN_MAX_HEIGHT } : undefined}
        >
            <Pressable
                testID={toggleTestID}
                accessibilityRole="button"
                aria-expanded={expanded}
                accessibilityState={{ expanded }}
                onPress={() => setExpanded(open => !open)}
                className="min-h-12 shrink-0 flex-row items-center justify-between px-4"
            >
                <Text className="text-sm font-medium text-foreground">{title}</Text>
                <Chevron size={18} color={color} />
            </Pressable>
            <Content isVisible={expanded} testID={testID}>
                {children}
            </Content>
        </View>
    )
}
