import { log } from '@tinycld/core/lib/logger'
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { type UnappliedPayment, useUnappliedPayments } from '../../hooks/useUnappliedPayments'
import { unappliedPaymentsText } from '../../lib/apply-credit-schema'

const LOG_CONTEXT = 'books.unappliedPayments'
const LINK_TEXT = 'text-sm text-primary underline'

// What the line's links open. The screen builds them (useOpenDocumentById,
// useOpenCustomerPage) outside Dialog and Sheet content and hands them in: the line draws no
// navigation hook, since the native overlay host does not pass the screen's navigation.
export type PaymentsLineOpeners = {
    onOpenPayment: (paymentId: string) => void
    onOpenCustomer: () => void
}

// One payment's line: its number a link that opens the payment, then the rest of the line's
// text.
function PaymentLine({
    payment,
    line,
    testIdPrefix,
    onOpenPayment,
}: {
    payment: UnappliedPayment
    line: string
    testIdPrefix: string
    onOpenPayment: (paymentId: string) => void
}) {
    const open = () => onOpenPayment(payment.id)
    const linkText = `Payment ${payment.number}`
    const rest = line.slice(linkText.length)
    return (
        <Text className="text-sm text-foreground">
            <Text
                testID={`${testIdPrefix}-payment-${payment.id}`}
                accessibilityRole="link"
                className={LINK_TEXT}
                onPress={open}
            >
                {linkText}
            </Text>
            {rest}
        </Text>
    )
}

// "and 2 more payments on the customer's page": a link to the customer page.
function MorePaymentsLink({
    text,
    testIdPrefix,
    onOpenCustomer,
}: {
    text: string
    testIdPrefix: string
    onOpenCustomer: () => void
}) {
    if (text === '') return null
    return (
        <Text
            testID={`${testIdPrefix}-payments-more`}
            accessibilityRole="link"
            className={`self-start ${LINK_TEXT}`}
            onPress={onOpenCustomer}
        >
            {text}
        </Text>
    )
}

/**
 * The payments line (apply credit spec §3.1, §3.3, Q2): for each of the customer's posted
 * payments with an amount that is not applied to an invoice (useUnappliedPayments, the
 * oldest three), "Payment 1004 has $100.00 that is not applied to an invoice. Open the payment
 * and edit it to apply that amount.", the payment's number a link that calls `onOpenPayment`
 * (`<testIdPrefix>-payment-<id>`); with more such payments, "and 2 more payments on the
 * customer's page", a link that calls `onOpenCustomer` (`<testIdPrefix>-payments-more`). It
 * has no Apply button. Nothing while the read loads, when the customer has no such payment,
 * or for `''`. A failed read draws nothing and logs a warning: the line is a hint, and the
 * invoice's notice has its own Retry over the credits read.
 */
export function UnappliedPaymentsLine({
    customerId,
    currency,
    testID,
    testIdPrefix,
    openers,
}: {
    customerId: string
    currency: string
    testID: string
    testIdPrefix: string
    openers: PaymentsLineOpeners
}) {
    const read = useUnappliedPayments(customerId)
    const { isError } = read
    useEffect(() => {
        if (isError) log.warn(LOG_CONTEXT, 'the payments not applied did not load', { customerId })
    }, [isError, customerId])
    const texts = unappliedPaymentsText(read.payments, read.moreCount, currency)
    const isEmpty = !read.isReady || isError || read.payments.length === 0
    if (isEmpty) return null
    const lines = read.payments.map((payment, index) => (
        <PaymentLine
            key={payment.id}
            payment={payment}
            line={texts.lines[index]}
            testIdPrefix={testIdPrefix}
            onOpenPayment={openers.onOpenPayment}
        />
    ))
    return (
        <View testID={testID} className="gap-1">
            {lines}
            <MorePaymentsLink
                text={texts.more}
                testIdPrefix={testIdPrefix}
                onOpenCustomer={openers.onOpenCustomer}
            />
        </View>
    )
}
