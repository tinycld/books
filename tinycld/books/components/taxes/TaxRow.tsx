import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { TaxRowView } from '../../lib/taxes-view'
import { TaxBadge } from './TaxBadge'

interface TaxRowProps {
    row: TaxRowView
    trailing: ReactNode
}

// The percent keeps its width and the trailing slot always takes 44 px, so the
// figures line up down a card whether or not a row has a menu.
const PERCENT_STYLE = { minWidth: 64 }
const TRAILING_STYLE = { width: 44 }

function ComponentsLine({ id, text, dim }: { id: string; text: string; dim: string }) {
    if (!text) return null
    return (
        <Text
            testID={`tax-components-${id}`}
            className={`text-xs text-muted-foreground ${dim}`}
            numberOfLines={2}
        >
            {text}
        </Text>
    )
}

export function TaxRow({ row, trailing }: TaxRowProps) {
    // The texts are muted, not the badges, so the Inactive badge keeps its own contrast.
    // The name takes two lines: a reader has no Edit dialog to read a long name in.
    const dim = row.inactive ? 'opacity-60' : ''
    return (
        <View
            testID={`tax-row-${row.id}`}
            className="min-h-12 flex-row items-center gap-2 border-b border-border py-1"
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                    <Text
                        testID={`tax-name-${row.id}`}
                        className={`min-w-0 shrink text-sm text-foreground ${dim}`}
                        numberOfLines={2}
                    >
                        {row.name}
                    </Text>
                    <TaxBadge
                        isVisible={row.isDefault}
                        label="Default"
                        tone="accent"
                        testID={`tax-default-badge-${row.id}`}
                    />
                    <TaxBadge
                        isVisible={row.inactive}
                        label="Inactive"
                        tone="muted"
                        testID={`tax-inactive-badge-${row.id}`}
                    />
                </View>
                <ComponentsLine id={row.id} text={row.components} dim={dim} />
            </View>
            <Text
                testID={`tax-percent-${row.id}`}
                className={`shrink-0 text-right text-sm tabular-nums text-foreground ${dim}`}
                style={PERCENT_STYLE}
            >
                {row.percent}
            </Text>
            <View className="items-center justify-center" style={TRAILING_STYLE}>
                {trailing}
            </View>
        </View>
    )
}
