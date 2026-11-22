import { View } from 'react-native'
import { itemAmountText } from '../../lib/deposit'
import { TotalLine } from '../payments/PaymentTotals'

const TOTALS_WIDTH = { minWidth: 320 }

interface OtherFundsTotalProps {
    isVisible: boolean
    cents: number
    currency: string
}

function OtherFundsTotal({ isVisible, cents, currency }: OtherFundsTotalProps) {
    if (!isVisible) return null
    const amount = itemAmountText(cents, currency)
    const isDanger = cents < 0
    return (
        <TotalLine
            label="Other funds"
            amount={amount}
            isStrong={false}
            isDanger={isDanger}
            testID="deposit-total-lines"
        />
    )
}

interface DepositTotalsProps {
    // Each in cents: the items' sum, the other funds lines' sum and the deposit total.
    itemsTotal: number
    linesTotal: number
    total: number
    // Other funds shows only when the deposit has lines.
    hasLines: boolean
    currency: string
}

/**
 * Selected items, Other funds (only with lines) and Deposit total (bank deposit spec §3.6,
 * §3.8), right-aligned, the last one strong. A sum below zero reads "−$20.00" in the
 * danger tone.
 */
export function DepositTotals({
    itemsTotal,
    linesTotal,
    total,
    hasLines,
    currency,
}: DepositTotalsProps) {
    const itemsText = itemAmountText(itemsTotal, currency)
    const totalText = itemAmountText(total, currency)
    const isItemsDanger = itemsTotal < 0
    const isTotalDanger = total < 0
    return (
        <View testID="deposit-totals" className="gap-1 self-end" style={TOTALS_WIDTH}>
            <TotalLine
                label="Selected items"
                amount={itemsText}
                isStrong={false}
                isDanger={isItemsDanger}
                testID="deposit-total-items"
            />
            <OtherFundsTotal isVisible={hasLines} cents={linesTotal} currency={currency} />
            <TotalLine
                label="Deposit total"
                amount={totalText}
                isStrong
                isDanger={isTotalDanger}
                testID="deposit-total"
            />
        </View>
    )
}
