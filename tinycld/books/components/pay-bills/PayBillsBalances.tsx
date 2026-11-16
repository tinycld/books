import { View } from 'react-native'
import type { PayBillsBalances as Balances } from '../../hooks/usePayBillsForm'
import { TotalLine } from '../payments/PaymentTotals'

const WIDTH = { minWidth: 320 }

function OriginalNowLine({ line }: { line: Balances['originalNow'] }) {
    if (!line.isVisible) return null
    return (
        <TotalLine
            label={line.label}
            amount={line.amount}
            isStrong={false}
            testID="pay-bills-original-now"
        />
    )
}

/**
 * Once Paid from is picked (and its balance is exact): Current balance, on `?replaces` paid
 * from the original's account "Payment 1004 now" (the original put back), Total payment
 * with its minus sign, and New balance, strong, in the danger tone when a bank account
 * goes below zero (spec §3.4). It warns only; Pay is not blocked.
 */
export function PayBillsBalances({ balances }: { balances: Balances }) {
    if (!balances.isVisible) return null
    return (
        <View testID="pay-bills-balances" className="gap-1" style={WIDTH}>
            <TotalLine
                label="Current balance"
                amount={balances.current}
                isStrong={false}
                testID="pay-bills-current-balance"
            />
            <OriginalNowLine line={balances.originalNow} />
            <TotalLine
                label="Total payment"
                amount={balances.totalPayment}
                isStrong={false}
                testID="pay-bills-total-payment"
            />
            <TotalLine
                label="New balance"
                amount={balances.newBalance}
                isStrong
                isDanger={balances.isNewBalanceNegative}
                testID="pay-bills-new-balance"
            />
        </View>
    )
}
