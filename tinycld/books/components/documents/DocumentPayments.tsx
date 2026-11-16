import { Pressable, Text, View } from 'react-native'
import type { DocumentPayment } from '../../hooks/document-data'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'

const TAP = { minHeight: 44 }

// What the block names and opens: the payment's noun ("Payment", "Bill payment"), the
// route of its read view and the test id prefix of the document it sits on.
type PaymentsTarget = {
    noun: string
    routeBase: string
    testIdPrefix: string
}

// "Payment 1003 · Oct 12, 2026 · $100.00": the payment's noun, number and date, and what
// it pays on this document.
function paymentLinkText(payment: DocumentPayment, noun: string, currency: string): string {
    const day = formatDay(payment.date)
    return `${noun} ${payment.number} · ${day} · ${formatMoney(payment.amount, currency)}`
}

interface PaymentLinkProps extends PaymentsTarget {
    payment: DocumentPayment
    currency: string
}

function PaymentLink({ payment, currency, noun, routeBase, testIdPrefix }: PaymentLinkProps) {
    // Back to the payment's screen when it is below this document (the document was opened
    // from the payment's applied list); else pushed, so Back returns here.
    const open = useOpenDocument({ routeBase }, payment.payment)
    const text = paymentLinkText(payment, noun, currency)
    return (
        <Pressable
            testID={`${testIdPrefix}-payment-${payment.payment}`}
            accessibilityRole="link"
            onPress={open}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline">{text}</Text>
        </Pressable>
    )
}

interface DocumentPaymentsProps extends PaymentsTarget {
    payments: readonly DocumentPayment[]
    currency: string
}

/**
 * The Payments block of an invoice's or a bill's read view (receive-payment spec §3.9,
 * pay-bills spec §3.9): a link per posted payment applied to the document, oldest first,
 * each opening the payment. Nothing while no payment applies.
 */
export function DocumentPayments({
    payments,
    currency,
    noun,
    routeBase,
    testIdPrefix,
}: DocumentPaymentsProps) {
    if (payments.length === 0) return null
    const links = payments.map(payment => (
        <PaymentLink
            key={payment.id}
            payment={payment}
            currency={currency}
            noun={noun}
            routeBase={routeBase}
            testIdPrefix={testIdPrefix}
        />
    ))
    return (
        <View testID={`${testIdPrefix}-payments`} className="gap-1">
            <Text className="text-sm font-semibold text-foreground">Payments</Text>
            {links}
        </View>
    )
}
