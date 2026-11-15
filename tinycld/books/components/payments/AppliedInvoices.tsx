import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { ScrollView, Text, View } from 'react-native'
import type { PaymentApplicationRow } from '../../hooks/usePaymentRecord'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { formatMoney } from '../../lib/money'
import {
    PAYMENT_APPLIED_MIN_WIDTH,
    PAYMENT_CARDS_BELOW,
    PAYMENT_COLUMNS,
} from '../../lib/payment-columns'
import { formatDay } from '../../lib/register-range'
import { AppliedInvoiceCards } from './AppliedInvoiceCards'
import { AppliedInvoiceLink, invoiceLabel } from './OutstandingGrid'

const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const MONEY_CELL = 'text-right text-sm text-foreground tabular-nums'
const COL = {
    invoice: PAYMENT_COLUMNS.invoice,
    dueDate: { width: PAYMENT_COLUMNS.dueDate },
    original: { width: PAYMENT_COLUMNS.original },
    applied: { width: PAYMENT_COLUMNS.payment },
} as const

function AppliedRow({
    application,
    currency,
}: {
    application: PaymentApplicationRow
    currency: string
}) {
    const invoice = application.invoiceRow
    const number = invoice?.number ?? ''
    const label = invoiceLabel({ number, date: (invoice?.date ?? '').slice(0, 10) })
    const due = formatDay((invoice?.due_date ?? '').slice(0, 10))
    const original = formatMoney(invoice?.total ?? 0, currency)
    const applied = formatMoney(application.amount, currency)
    return (
        <View
            testID={`payment-applied-${application.invoice}`}
            className="flex-row items-center gap-3 border-b border-border px-2"
        >
            <View style={COL.invoice}>
                <AppliedInvoiceLink
                    invoiceId={application.invoice}
                    label={label}
                    testID={`payment-read-link-${application.invoice}`}
                />
            </View>
            <Text className="text-sm text-foreground" style={COL.dueDate}>
                {due}
            </Text>
            <Text className={MONEY_CELL} style={COL.original}>
                {original}
            </Text>
            <Text className={MONEY_CELL} style={COL.applied}>
                {applied}
            </Text>
        </View>
    )
}

interface AppliedInvoicesProps {
    applications: readonly PaymentApplicationRow[]
    currency: string
}

// The read view's "Applied to" list: a grid of Invoice (a link), Due date, Original amount
// and Applied, or cards while the list's own width is below PAYMENT_CARDS_BELOW.
export function AppliedInvoices({ applications, currency }: AppliedInvoicesProps) {
    // The rows sit in the page's scroller, not a scroller of their own, so the gutter the
    // hook measures stays 0 and only the content width is used.
    const { contentStyle } = useTableMinWidth(PAYMENT_APPLIED_MIN_WIDTH)
    const { width, onLayout } = useContainerWidth()
    if (applications.length === 0) return null
    const isCards = width > 0 && width < PAYMENT_CARDS_BELOW
    const body = isCards ? (
        <AppliedInvoiceCards applications={applications} currency={currency} />
    ) : (
        <AppliedGrid applications={applications} currency={currency} contentStyle={contentStyle} />
    )
    return (
        <View className="gap-2" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">Applied to</Text>
            {body}
        </View>
    )
}

function AppliedGrid({
    applications,
    currency,
    contentStyle,
}: AppliedInvoicesProps & { contentStyle: ReturnType<typeof useTableMinWidth>['contentStyle'] }) {
    const rows = applications.map(application => (
        <AppliedRow key={application.id} application={application} currency={currency} />
    ))
    return (
        <ScrollView horizontal contentContainerStyle={contentStyle}>
            <View testID="payment-applied" style={{ flex: 1 }}>
                <View className="flex-row items-center gap-3 border-b border-border px-2 py-2">
                    <Text className={HEAD} style={COL.invoice}>
                        Invoice
                    </Text>
                    <Text className={HEAD} style={COL.dueDate}>
                        Due date
                    </Text>
                    <Text className={`${HEAD} text-right`} style={COL.original}>
                        Original amount
                    </Text>
                    <Text className={`${HEAD} text-right`} style={COL.applied}>
                        Applied
                    </Text>
                </View>
                {rows}
            </View>
        </ScrollView>
    )
}
