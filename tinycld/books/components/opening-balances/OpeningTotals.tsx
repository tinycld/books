import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import type { OpeningBuild } from '../../lib/opening-balances'

function Figure({
    label,
    cents,
    currency,
    testID,
}: {
    label: string
    cents: number
    currency: string
    testID: string
}) {
    const tone = cents < 0 ? 'text-destructive' : 'text-foreground'
    return (
        <View className="mr-8 gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text testID={testID} className={`text-base font-semibold ${tone}`}>
                {formatMoney(cents, currency)}
            </Text>
        </View>
    )
}

function Figures({
    build,
    currency,
    isVisible,
}: {
    build: OpeningBuild
    currency: string
    isVisible: boolean
}) {
    if (!isVisible) return null
    const { totals } = build
    return (
        <>
            <Figure
                label="Assets"
                cents={totals.assets}
                currency={currency}
                testID="opening-total-assets"
            />
            <Figure
                label="Liabilities"
                cents={totals.liabilities}
                currency={currency}
                testID="opening-total-liabilities"
            />
            <Figure
                label="Equity (including Opening Balance Equity)"
                cents={totals.equityWithBalancing}
                currency={currency}
                testID="opening-total-equity"
            />
        </>
    )
}

function Problem({ message }: { message: string | null }) {
    if (message === null) return null
    return (
        <Text
            testID="opening-totals-problem"
            accessibilityRole="alert"
            className="text-sm font-semibold text-destructive"
        >
            {message}
        </Text>
    )
}

interface OpeningTotalsProps {
    build: OpeningBuild
    currency: string
    isBlocked: boolean
    blockMessage: string | null
}

export function OpeningTotals({ build, currency, isBlocked, blockMessage }: OpeningTotalsProps) {
    return (
        <View
            testID="opening-totals"
            className="flex-row flex-wrap gap-y-2 border-t border-border bg-surface-secondary px-4 py-2"
        >
            <Figures build={build} currency={currency} isVisible={!isBlocked} />
            <Problem message={blockMessage} />
        </View>
    )
}
