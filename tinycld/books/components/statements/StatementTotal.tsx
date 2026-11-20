import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import { totalCaption } from '../../lib/statement-recipients'

interface StatementTotalProps {
    count: number
    total: number
    currency: string
}

/**
 * The total of Create statements (spec §3.3): the caption over the sum of the ticked rows'
 * balances, in the big-amount style of PayBillsBand. Right-aligned on a wide screen, where
 * it sits at the right of the title; the screen puts it first on a phone.
 */
export function StatementTotal({ count, total, currency }: StatementTotalProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const align = isPhone ? '' : 'items-end'
    const caption = totalCaption(count)
    const figure = formatMoney(total, currency)
    return (
        <View className={align}>
            <Text testID="statements-total-caption" className="text-sm text-muted-foreground">
                {caption}
            </Text>
            <Text
                testID="statements-total"
                className="text-3xl font-semibold text-foreground tabular-nums"
            >
                {figure}
            </Text>
        </View>
    )
}
