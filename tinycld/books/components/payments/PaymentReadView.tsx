import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import type { PaymentApplicationRow, PaymentRow } from '../../hooks/usePaymentRecord'
import { type DepositAccountRow, paymentText } from '../../lib/deposit-accounts'
import { formatMoney } from '../../lib/money'
import { type AppliedDocumentRow, INVOICE_OUTSTANDING } from '../../lib/outstanding-documents'
import { paymentReadActions } from '../../lib/payment-read-actions'
import { fillPaymentText, PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { formatDay } from '../../lib/register-range'
import { DocumentHeader } from '../documents/DocumentHeader'
import { EntryBackLink } from '../entries/EntryHeader'
import { AppliedInvoices } from './AppliedInvoices'
import { PaymentReadActions } from './PaymentReadActions'
import { CreditLine, TotalLine } from './PaymentTotals'
import { Detail, READ_BAND, ReplacedBy, Stamp, stampOf, TextLink } from './read-view-parts'

function depositLabelOf(accounts: readonly DepositAccountRow[], id: string): string {
    const account = accounts.find(row => row.id === id)
    if (!account) return ''
    return account.number ? `${account.number} ${account.name}` : account.name
}

// The applications as the shared applied list reads them.
function appliedRowsOf(applications: readonly PaymentApplicationRow[]): AppliedDocumentRow[] {
    return applications.map(application => {
        const invoice = application.invoiceRow
        return {
            id: application.id,
            documentId: application.invoice,
            number: invoice?.number ?? '',
            date: (invoice?.date ?? '').slice(0, 10),
            dueDate: (invoice?.due_date ?? '').slice(0, 10),
            ref: '',
            total: invoice?.total ?? 0,
            amount: application.amount,
        }
    })
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
    const appliedRows = appliedRowsOf(applications)
    const offered = paymentReadActions(payment.status, canWrite, payment.entry !== '')
    const editHref = `books/payments/new?replaces=${payment.id}`
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
                <View className={`${READ_BAND} flex-row flex-wrap gap-x-6 gap-y-3`}>
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
                <AppliedInvoices
                    doc={INVOICE_OUTSTANDING}
                    rows={appliedRows}
                    currency={currency}
                    testIdPrefix="payment"
                    total={null}
                />
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
                    <ReplacedBy
                        replacement={payment.replacedBy}
                        routeBase="books/payments"
                        testID="payment-replaced-by"
                    />
                </View>
            </ScrollView>
            <PaymentReadActions
                payment={payment}
                offered={offered}
                historyItem={null}
                scopeOwner={scopeOwner}
                collection="books_payments"
                editHref={editHref}
                voidBody={PAYMENT_MESSAGES.voidBody}
                confirmLabel="Void payment"
                entryNoun="payment"
            />
        </View>
    )
}
