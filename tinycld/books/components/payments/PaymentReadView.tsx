import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import type { PaymentRecordHeader, PaymentRecordView } from '../../hooks/usePaymentRecord'
import { paymentText } from '../../lib/deposit-accounts'
import { formatMoney } from '../../lib/money'
import type { AppliedDocumentRow } from '../../lib/outstanding-documents'
import type { PaymentFlow } from '../../lib/payment-flow'
import { type PaymentCollectionName, paymentReadActions } from '../../lib/payment-read-actions'
import { fillPaymentText, PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { formatDay } from '../../lib/register-range'
import { DocumentHeader } from '../documents/DocumentHeader'
import { EntryBackLink } from '../entries/EntryHeader'
import { AppliedInvoices } from './AppliedInvoices'
import { PaymentReadActions } from './PaymentReadActions'
import { CreditLine, TotalLine } from './PaymentTotals'
import { Detail, READ_BAND, ReplacedBy, Stamp, stampOf, TextLink } from './read-view-parts'

type AppliedLine = Pick<
    PaymentRecordView['lines'][number],
    'id' | 'document' | 'isFiled' | 'number' | 'date' | 'ref' | 'total' | 'amount'
> & { dueDate?: string }

// The lines as the shared applied list reads them; a line whose document is not in the
// store yet (`isFiled` false) is left out until it is.
function appliedRowsOf(lines: readonly AppliedLine[]): AppliedDocumentRow[] {
    return lines.flatMap(line => {
        if (!line.isFiled) return []
        return [
            {
                id: line.id,
                documentId: line.document,
                number: line.number,
                date: line.date.slice(0, 10),
                dueDate: (line.dueDate ?? '').slice(0, 10),
                ref: line.ref,
                total: line.total,
                amount: line.amount,
            },
        ]
    })
}

interface AppliedTotalsProps {
    isVisible: boolean
    flow: PaymentFlow
    applied: number
    credited: number
    partyName: string
    currency: string
}

// Amount applied and Amount credited with its note (written by the server at posting, in
// cents as `amount` is), for a flow that keeps a credit.
function AppliedTotals({
    isVisible,
    flow,
    applied,
    credited,
    partyName,
    currency,
}: AppliedTotalsProps) {
    if (!isVisible) return null
    const { testId } = flow
    const creditText = credited > 0 ? formatMoney(credited, currency) : ''
    const creditNote = fillPaymentText(PAYMENT_MESSAGES.keptAsCredit, partyName)
    return (
        <View className="gap-1 self-end" style={{ minWidth: 320 }}>
            <TotalLine
                label="Amount applied"
                amount={formatMoney(applied, currency)}
                isStrong={false}
                testID={`${testId}-amount-applied`}
            />
            <CreditLine
                credit={creditText}
                note={creditNote}
                label="Amount credited"
                testID={`${testId}-amount-credited`}
                noteTestID={`${testId}-${flow.ids.totalNote}`}
            />
        </View>
    )
}

interface PaymentReadViewProps {
    flow: PaymentFlow
    payment: PaymentRecordHeader
    lines: PaymentRecordView['lines']
    partyName: string
    // The account's label ("1010 Checking"), read by the flow's screen.
    accountLabel: string
    currency: string
    canWrite: boolean
    scopeOwner: ScopeOwner
    // The flow's header collection, which the read actions void through.
    collection: PaymentCollectionName
}

/**
 * A posted or void payment (receive-payment spec §3.7, vendor refund spec §3.7): the
 * header, the party (a link), the date and the payment line, the applied documents, the
 * flow's applied and credited totals, the memo, the stamps, and the bar. The flow gives
 * every text, test id and route.
 */
export function PaymentReadView({
    flow,
    payment,
    lines,
    partyName,
    accountLabel,
    currency,
    canWrite,
    scopeOwner,
    collection,
}: PaymentReadViewProps) {
    const orgHref = useOrgHref()
    const { texts, testId, ids } = flow
    const paymentLine = paymentText({
        method: payment.payment_method,
        reference: payment.reference_no,
        depositLabel: accountLabel,
        verb: texts.paymentVerb,
    })
    const openParty = () => router.push(orgHref(`${flow.partyRoute}/${payment.party}`))
    const posted = stampOf('Posted', payment.postedByName, payment.posted_at)
    const voided = stampOf('Voided', payment.voidedByName, payment.voided_at)
    const title = texts.readTitle(payment.number)
    const figure = formatMoney(payment.amount, currency)
    const date = formatDay(payment.date.slice(0, 10))
    const appliedRows = appliedRowsOf(lines)
    const offered = paymentReadActions(payment.status, canWrite, payment.entry !== '')
    const editHref = `${flow.routeBase}/new?replaces=${payment.id}`
    return (
        <View testID={`${testId}-read-only`} className="flex-1 bg-background">
            <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                <EntryBackLink />
                <DocumentHeader
                    title={title}
                    status={payment.status}
                    figure={figure}
                    isExpired={false}
                />
                <View className={`${READ_BAND} flex-row flex-wrap gap-x-6 gap-y-3`}>
                    <View testID={`${testId}-detail-${ids.party}`} className="gap-0.5">
                        <Text className="text-xs text-muted-foreground">{texts.partyLabel}</Text>
                        <TextLink
                            text={partyName}
                            onPress={openParty}
                            testID={`${testId}-${ids.party}-link`}
                        />
                    </View>
                    <Detail label={texts.dateLabel} value={date} testID={`${testId}-detail-date`} />
                    <Detail
                        label="Payment"
                        value={paymentLine}
                        testID={`${testId}-detail-payment`}
                    />
                </View>
                <AppliedInvoices
                    doc={flow.doc}
                    rows={appliedRows}
                    currency={currency}
                    testIdPrefix={testId}
                    total={null}
                    heading={texts.readListHeading}
                />
                <AppliedTotals
                    isVisible={texts.hasAppliedTotal}
                    flow={flow}
                    applied={payment.applied}
                    credited={payment.credited}
                    partyName={partyName}
                    currency={currency}
                />
                <Detail
                    label={texts.memoLabel}
                    value={payment.memo}
                    testID={`${testId}-${ids.memoText}`}
                />
                <View className="gap-1">
                    <Stamp text={posted} testID={`${testId}-posted-by`} />
                    <Stamp text={voided} testID={`${testId}-voided-by`} />
                    <ReplacedBy
                        replacement={payment.replacement}
                        routeBase={flow.routeBase}
                        testID={`${testId}-replaced-by`}
                    />
                </View>
            </ScrollView>
            <PaymentReadActions
                payment={payment}
                offered={offered}
                historyItem={null}
                scopeOwner={scopeOwner}
                collection={collection}
                editHref={editHref}
                voidBody={texts.voidBody}
                confirmLabel={texts.voidConfirm}
                entryNoun={texts.voidNoun}
            />
        </View>
    )
}
