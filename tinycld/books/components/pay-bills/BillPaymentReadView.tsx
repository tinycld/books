import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import {
    type BillPaymentLineRow,
    type BillPaymentRow,
    useBillPaymentRecord,
} from '../../hooks/useBillPaymentRecord'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { accountLabel } from '../../lib/account-options'
import { billPaymentReadState } from '../../lib/bill-payment-read-state'
import { paymentText } from '../../lib/deposit-accounts'
import { type LiveRecovery, mergeRecoveries } from '../../lib/live-recovery'
import { formatMoney } from '../../lib/money'
import { type AppliedDocumentRow, BILL_OUTSTANDING } from '../../lib/outstanding-documents'
import { BILL_PAYMENT_CHROME } from '../../lib/pay-bills-kind'
import { billPaymentTitleText } from '../../lib/pay-bills-texts'
import { formatDay } from '../../lib/register-range'
import { DocumentHeader } from '../documents/DocumentHeader'
import { DocumentChromeContext } from '../documents/document-chrome'
import { EntryBackLink } from '../entries/EntryHeader'
import { AppliedInvoices } from '../payments/AppliedInvoices'
import {
    Detail,
    READ_BAND,
    ReplacedBy,
    Stamp,
    stampOf,
    TextLink,
} from '../payments/read-view-parts'
import { BillPaymentReadActions } from './BillPaymentReadActions'
import { BillPaymentStateNotice } from './BillPaymentStateNotice'

const TEST_ID_PREFIX = BILL_PAYMENT_CHROME.testId
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The lines as the shared applied list reads them (a line whose bill is not in the store
// keeps its amount; the record waits for every bill, so this does not show).
function appliedRowsOf(lines: readonly BillPaymentLineRow[]): AppliedDocumentRow[] {
    return lines.map(line => {
        const bill = line.billRow
        return {
            id: line.id,
            documentId: line.bill,
            number: bill?.number ?? '',
            date: (bill?.date ?? '').slice(0, 10),
            dueDate: (bill?.due_date ?? '').slice(0, 10),
            ref: bill?.ref_no ?? '',
            total: bill?.total ?? 0,
            amount: line.amount,
        }
    })
}

interface BillPaymentReadViewProps {
    payment: BillPaymentRow
    lines: readonly BillPaymentLineRow[]
    currency: string
    canWrite: boolean
    scopeOwner: ScopeOwner
}

/**
 * A posted or void bill payment (spec §3.8): the header (title, Posted / Void, Amount
 * paid), the vendor (a link), Paid from, the date and the payment line ("Check · 1042"),
 * Bills paid with its Total (a grid, or cards while the list is narrower than the grid's
 * least width), the stamps, "Replaced by" on a replaced original, and the bar.
 */
function BillPaymentReadView({
    payment,
    lines,
    currency,
    canWrite,
    scopeOwner,
}: BillPaymentReadViewProps) {
    const orgHref = useOrgHref()
    const paymentLine = paymentText({
        method: payment.payment_method,
        reference: payment.reference_no,
        depositLabel: '',
        verb: 'paid from',
    })
    const vendorName = payment.vendorRow?.display_name ?? ''
    const openVendor = () => router.push(orgHref(`books/vendors/${payment.vendor}`))
    const paidFrom = payment.paidFromRow ? accountLabel(payment.paidFromRow) : ''
    const posted = stampOf('Posted', payment.postedBy?.name, payment.posted_at)
    const voided = stampOf('Voided', payment.voidedBy?.name, payment.voided_at)
    const title = billPaymentTitleText(payment.number)
    const figure = formatMoney(payment.total, currency)
    const date = formatDay(payment.date.slice(0, 10))
    const rows = appliedRowsOf(lines)
    return (
        <View testID={`${TEST_ID_PREFIX}-read-only`} className="flex-1 bg-background">
            <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                <EntryBackLink />
                <DocumentHeader
                    title={title}
                    status={payment.status}
                    figure={figure}
                    isExpired={false}
                />
                <View className={`${READ_BAND} flex-row flex-wrap gap-x-6 gap-y-3`}>
                    <View testID={`${TEST_ID_PREFIX}-detail-vendor`} className="gap-0.5">
                        <Text className="text-xs text-muted-foreground">Vendor</Text>
                        <TextLink
                            text={vendorName}
                            onPress={openVendor}
                            testID={`${TEST_ID_PREFIX}-vendor-link`}
                        />
                    </View>
                    <Detail
                        label="Paid from"
                        value={paidFrom}
                        testID={`${TEST_ID_PREFIX}-detail-paid-from`}
                    />
                    <Detail
                        label="Payment date"
                        value={date}
                        testID={`${TEST_ID_PREFIX}-detail-date`}
                    />
                    <Detail
                        label="Payment"
                        value={paymentLine}
                        testID={`${TEST_ID_PREFIX}-detail-payment`}
                    />
                </View>
                <AppliedInvoices
                    doc={BILL_OUTSTANDING}
                    rows={rows}
                    currency={currency}
                    testIdPrefix={TEST_ID_PREFIX}
                    total={payment.total}
                />
                <View className="gap-1">
                    <Stamp text={posted} testID={`${TEST_ID_PREFIX}-posted-by`} />
                    <Stamp text={voided} testID={`${TEST_ID_PREFIX}-voided-by`} />
                    <ReplacedBy
                        replacement={payment.replacedBy}
                        routeBase="books/bill-payments"
                        testID={`${TEST_ID_PREFIX}-replaced-by`}
                    />
                </View>
            </ScrollView>
            <BillPaymentReadActions payment={payment} canWrite={canWrite} scopeOwner={scopeOwner} />
        </View>
    )
}

/**
 * Every read of the read view (spec §3.8, §4.4): access, settings (the currency) and the
 * payment with its lines. Returns the surface (`billPaymentReadState`: one error with one
 * Retry over every failed read, loading, not found, or the payment).
 */
function useBillPaymentReadScreen(id: string) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const record = useBillPaymentRecord(id)
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [] }
        : NO_RECOVERY
    const isError = access.isError || settings.hasLoadError || record.isError
    const isLoading = !access.isReady || !settings.isReady || record.isLoading
    const state = billPaymentReadState({ isLoading, isError, payment: record.payment })
    const recovery = mergeRecoveries([accessRecovery, settings.recovery, record.recovery])
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.billPayment', err),
        })
    }
    return {
        state,
        retry,
        payment: record.payment,
        lines: record.lines,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
    }
}

function BillPaymentSurface({ id, scopeOwner }: { id: string; scopeOwner: ScopeOwner }) {
    const screen = useBillPaymentReadScreen(id)
    if (screen.state === 'ready' && screen.payment) {
        return (
            <BillPaymentReadView
                payment={screen.payment}
                lines={screen.lines}
                currency={screen.currency}
                canWrite={screen.canWrite}
                scopeOwner={scopeOwner}
            />
        )
    }
    const notice = screen.state === 'ready' ? 'loading' : screen.state
    return <BillPaymentStateNotice state={notice} onRetry={screen.retry} />
}

/**
 * The bill payment read view at `books/bill-payments/<id>`: the shared document chrome
 * reads BILL_PAYMENT_CHROME, and the screen's `compose` scope holds the bar's keys.
 */
export function BillPaymentReadScreen({ id }: { id: string }) {
    const scopeOwner = useShortcutScope('compose')
    return (
        <DocumentChromeContext.Provider value={BILL_PAYMENT_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <BillPaymentSurface id={id} scopeOwner={scopeOwner} />
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
