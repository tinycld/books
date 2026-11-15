import { Pressable, Text, View } from 'react-native'
import type { InvoicePayment } from '../../hooks/document-data'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { formatMoney } from '../../lib/money'
import { TRANSACTION_DOC_KINDS } from '../../lib/party-transactions'
import { formatDay } from '../../lib/register-range'

const TAP = { minHeight: 44 }

// "Payment 1003 · Oct 12, 2026 · $100.00": the payment's number and date, and what it pays
// on this invoice.
function paymentLinkText(payment: InvoicePayment, currency: string): string {
    const day = formatDay(payment.date)
    return `Payment ${payment.number} · ${day} · ${formatMoney(payment.amount, currency)}`
}

function PaymentLink({ payment, currency }: { payment: InvoicePayment; currency: string }) {
    // Back to the payment's screen when it is below this invoice (the invoice was opened
    // from its applied list); else pushed, so Back returns here.
    const open = useOpenDocument(TRANSACTION_DOC_KINDS.payment, payment.payment)
    const text = paymentLinkText(payment, currency)
    return (
        <Pressable
            testID={`invoice-payment-${payment.payment}`}
            accessibilityRole="link"
            onPress={open}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline">{text}</Text>
        </Pressable>
    )
}

interface InvoicePaymentsProps {
    payments: readonly InvoicePayment[]
    currency: string
}

/**
 * The invoice read view's Payments block (receive-payment spec §3.9): a link per posted
 * payment applied to the invoice, oldest first, each opening the payment. Nothing while no
 * payment applies.
 */
export function InvoicePayments({ payments, currency }: InvoicePaymentsProps) {
    if (payments.length === 0) return null
    const links = payments.map(payment => (
        <PaymentLink key={payment.id} payment={payment} currency={currency} />
    ))
    return (
        <View testID="invoice-payments" className="gap-1">
            <Text className="text-sm font-semibold text-foreground">Payments</Text>
            {links}
        </View>
    )
}
