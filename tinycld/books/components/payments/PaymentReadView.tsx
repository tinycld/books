import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { PaymentApplicationRow, PaymentRow } from '../../hooks/usePaymentRecord'
import { type DepositAccountRow, paymentText } from '../../lib/deposit-accounts'
import { stampText } from '../../lib/entry-display'
import { formatMoney } from '../../lib/money'
import { fillPaymentText, PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { formatDay } from '../../lib/register-range'
import { DocumentHeader } from '../documents/DocumentHeader'
import { EntryBackLink } from '../entries/EntryHeader'
import { AppliedInvoices } from './AppliedInvoices'
import { PaymentReadActions } from './PaymentReadActions'
import { CreditLine, TotalLine } from './PaymentTotals'

const BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const TAP = { minHeight: 44 }

function Detail({ label, value, testID }: { label: string; value: string; testID: string }) {
    if (value === '') return null
    return (
        <View testID={testID} className="min-w-0 max-w-full gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className="text-sm text-foreground">{value}</Text>
        </View>
    )
}

function TextLink({
    text,
    onPress,
    testID,
}: {
    text: string
    onPress: () => void
    testID: string
}) {
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            onPress={onPress}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline">{text}</Text>
        </Pressable>
    )
}

function Stamp({ text, testID }: { text: string; testID: string }) {
    if (text === '') return null
    return (
        <Text testID={testID} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

function ReplacedBy({ payment }: { payment: PaymentRow }) {
    const orgHref = useOrgHref()
    const replacement = payment.replacedBy
    if (!replacement) return null
    const open = () => router.push(orgHref(`books/payments/${replacement.id}`))
    const text = `Replaced by ${replacement.number} (edited)`
    return <TextLink text={text} onPress={open} testID="payment-replaced-by" />
}

function depositLabelOf(accounts: readonly DepositAccountRow[], id: string): string {
    const account = accounts.find(row => row.id === id)
    if (!account) return ''
    return account.number ? `${account.number} ${account.name}` : account.name
}

function stampOf(verb: string, userName: string | undefined, at: string): string {
    const text = stampText(userName, at)
    return text ? `${verb} by ${text}` : ''
}

interface PaymentReadViewProps {
    payment: PaymentRow
    applications: readonly PaymentApplicationRow[]
    customerName: string
    depositAccounts: readonly DepositAccountRow[]
    currency: string
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * A posted or void payment (spec §3.7): the header, the customer (a link), the date and
 * the payment line, the applied invoices, Amount applied and Amount credited with its
 * note, the memo, the stamps, and the bar.
 */
export function PaymentReadView({
    payment,
    applications,
    customerName,
    depositAccounts,
    currency,
    canWrite,
    scopeOwner,
}: PaymentReadViewProps) {
    const orgHref = useOrgHref()
    // Written by the server at posting, in cents as `amount` is.
    const { applied, credited } = payment
    const paymentLine = paymentText({
        method: payment.payment_method,
        reference: payment.reference_no,
        depositLabel: depositLabelOf(depositAccounts, payment.deposit_to),
    })
    const openCustomer = () => router.push(orgHref(`books/customers/${payment.customer}`))
    const creditText = credited > 0 ? formatMoney(credited, currency) : ''
    const creditNote = fillPaymentText(PAYMENT_MESSAGES.keptAsCredit, customerName)
    const posted = stampOf('Posted', payment.postedBy?.name, payment.posted_at)
    const voided = stampOf('Voided', payment.voidedBy?.name, payment.voided_at)
    const title = `Payment ${payment.number}`
    const figure = formatMoney(payment.amount, currency)
    const date = formatDay(payment.date.slice(0, 10))
    const appliedText = formatMoney(applied, currency)
    return (
        <View testID="payment-read-only" className="flex-1 bg-background">
            <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                <EntryBackLink />
                <DocumentHeader
                    title={title}
                    status={payment.status}
                    figure={figure}
                    isExpired={false}
                />
                <View className={`${BAND} flex-row flex-wrap gap-x-6 gap-y-3`}>
                    <View testID="payment-detail-customer" className="gap-0.5">
                        <Text className="text-xs text-muted-foreground">Customer</Text>
                        <TextLink
                            text={customerName}
                            onPress={openCustomer}
                            testID="payment-customer-link"
                        />
                    </View>
                    <Detail label="Payment date" value={date} testID="payment-detail-date" />
                    <Detail label="Payment" value={paymentLine} testID="payment-detail-payment" />
                </View>
                <AppliedInvoices applications={applications} currency={currency} />
                <View className="gap-1 self-end" style={{ minWidth: 320 }}>
                    <TotalLine
                        label="Amount applied"
                        amount={appliedText}
                        isStrong={false}
                        testID="payment-amount-applied"
                    />
                    <CreditLine
                        credit={creditText}
                        note={creditNote}
                        label="Amount credited"
                        testID="payment-amount-credited"
                    />
                </View>
                <Detail
                    label="Internal memo (not printed)"
                    value={payment.memo}
                    testID="payment-detail-memo"
                />
                <View className="gap-1">
                    <Stamp text={posted} testID="payment-posted-by" />
                    <Stamp text={voided} testID="payment-voided-by" />
                    <ReplacedBy payment={payment} />
                </View>
            </ScrollView>
            <PaymentReadActions
                status={payment.status}
                canWrite={canWrite}
                entryId={payment.entry}
                scopeOwner={scopeOwner}
            />
        </View>
    )
}
