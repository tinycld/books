import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { usePartyBalance } from '../../../hooks/usePartyBalance'
import { balanceFigures } from '../../../lib/party-balance'
import type { PartyRef } from '../../../lib/party-page-tabs'

// The 3 px status marker at each figure's left (`border-l-[3px]` is in no scanned file).
const MARKER_STYLE: ViewStyle = { borderLeftWidth: 3 }

interface FigureProps {
    label: string
    value: string
    markerClass: string
    testID: string
}

function Figure({ label, value, markerClass, testID }: FigureProps) {
    return (
        <View className={`gap-0.5 pl-3 ${markerClass}`} style={MARKER_STYLE}>
            <Text testID={`${testID}-label`} className="text-xs uppercase text-muted-foreground">
                {label}
            </Text>
            <Text testID={testID} className="text-2xl font-semibold text-foreground">
                {value}
            </Text>
        </View>
    )
}

function BalanceError({ onRetry, testIdPrefix }: { onRetry: () => void; testIdPrefix: string }) {
    return (
        <View testID={`${testIdPrefix}-balance-error`} className="flex-row items-center gap-3">
            <Text className="text-sm text-muted-foreground">Balance unavailable</Text>
            <Pressable
                testID={`${testIdPrefix}-balance-retry`}
                accessibilityRole="button"
                onPress={onRetry}
                className="min-h-11 justify-center"
            >
                <Text className="text-sm font-medium text-primary">Retry</Text>
            </Pressable>
        </View>
    )
}

interface PartyBalanceProps extends PartyRef {
    testIdPrefix: string
}

/**
 * The party's Open and Overdue figures, side by side: "—" while they load, "Balance
 * unavailable" with Retry when a read fails.
 */
export function PartyBalance({ party, id, testIdPrefix }: PartyBalanceProps) {
    const balance = usePartyBalance({ party, id })
    if (balance.isError) return <BalanceError onRetry={balance.retry} testIdPrefix={testIdPrefix} />
    const figures = balanceFigures(balance)
    return (
        <View testID={`${testIdPrefix}-balance`} className="flex-row gap-8">
            <Figure
                testID={`${testIdPrefix}-balance-open`}
                label={figures.openLabel}
                value={figures.openText}
                markerClass="border-warning"
            />
            <Figure
                testID={`${testIdPrefix}-balance-overdue`}
                label="Overdue"
                value={figures.overdueText}
                markerClass="border-danger"
            />
        </View>
    )
}
