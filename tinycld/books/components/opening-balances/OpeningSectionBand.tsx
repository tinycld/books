import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import type { OpeningBand } from '../../lib/opening-balances'

interface OpeningSectionBandProps {
    band: OpeningBand
    subtotal: number
    currency: string
    height: number
}

export function subtotalTone(cents: number) {
    return cents < 0 ? 'text-danger' : 'text-foreground'
}

// A compact bar; the row window adds up this height and the rows' own.
export function OpeningSectionBand({ band, subtotal, currency, height }: OpeningSectionBandProps) {
    return (
        <View
            testID={`opening-band-${band.group}`}
            className="flex-row items-center justify-between gap-3 border-y border-border bg-surface-secondary px-4"
            style={{ height }}
        >
            <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-x-2">
                <Text className="text-sm font-bold text-foreground">{band.title}</Text>
                <Text className="text-xs text-muted-foreground">{band.caption}</Text>
            </View>
            <Text
                testID={`opening-band-subtotal-${band.group}`}
                className={`text-sm font-bold ${subtotalTone(subtotal)}`}
            >
                {formatMoney(subtotal, currency)}
            </Text>
        </View>
    )
}
