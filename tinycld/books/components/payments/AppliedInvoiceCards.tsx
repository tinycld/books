import { Text, View } from 'react-native'
import type { PaymentApplicationRow } from '../../hooks/usePaymentRecord'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
import { CARD, CardPair } from './OutstandingCards'
import { InvoiceLink } from './OutstandingGrid'

function AppliedCard({
    application,
    currency,
}: {
    application: PaymentApplicationRow
    currency: string
}) {
    const invoice = application.invoiceRow
    const label = `Invoice ${invoice?.number ?? ''}`
    const dueDate = (invoice?.due_date ?? '').slice(0, 10)
    const due = dueDate ? `Due ${formatDay(dueDate)}` : ''
    const original = formatMoney(invoice?.total ?? 0, currency)
    const applied = formatMoney(application.amount, currency)
    return (
        <View testID={`payment-applied-${application.invoice}`} className={CARD}>
            <InvoiceLink
                invoiceId={application.invoice}
                label={label}
                testID={`payment-read-link-${application.invoice}`}
            />
            <Text className="text-sm text-foreground">{due}</Text>
            <View className="flex-row gap-3">
                <CardPair label="Original" value={original} />
                <CardPair label="Applied" value={applied} />
            </View>
        </View>
    )
}

/**
 * The read view's applied invoices below 640 px (spec §3.7): one card per invoice with the
 * invoice link, its due date, and Original and Applied as a label-value pair.
 */
export function AppliedInvoiceCards({
    applications,
    currency,
}: {
    applications: readonly PaymentApplicationRow[]
    currency: string
}) {
    const drawn = applications.map(application => (
        <AppliedCard key={application.id} application={application} currency={currency} />
    ))
    return (
        <View testID="payment-applied" className="gap-3">
            {drawn}
        </View>
    )
}
