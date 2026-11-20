import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import type { DocumentRecord } from '../../hooks/document-data'
import type { ApplyCreditTarget } from '../../hooks/useApplyCredit'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useOpenCustomerPage } from '../../hooks/useCustomerNavigation'
import { useOpenDocumentById } from '../../hooks/useOpenDocument'
import { useUnappliedCreditMemos } from '../../hooks/useUnappliedCreditMemos'
import { useUnappliedPayments } from '../../hooks/useUnappliedPayments'
import { applySideTexts } from '../../lib/apply-credit-schema'
import { applyCreditLabel, CREDIT_MEMO_APPLICATION } from '../../lib/credit-application-kinds'
import { formatMoney } from '../../lib/money'
import { useApplyCreditStore } from '../../stores/apply-credit-store'
import { ListBanner } from '../ListBanner'
import { APPLY_NOTICE_BOX, ApplyCreditNotice } from './ApplyCreditNotice'
import { ApplyDialogSlot, useCloseOnBlur } from './CreditApplySection'
import type { DocumentReadFrameProps } from './document-kinds'
import { type PaymentsLineOpeners, UnappliedPaymentsLine } from './UnappliedPaymentsLine'

const LOG_CONTEXT = 'books.invoiceApply'
const PAYMENT_ROUTE = { routeBase: 'books/payments' }
const NOTICE_ID = 'invoice-apply-notice'
// Its own prefix, not the notice's: a locator of the notice must not match the banner's ids.
const CREDITS_LOAD_ID = 'invoice-credits-load'
const CREDITS_LOAD_FAILED = applySideTexts(CREDIT_MEMO_APPLICATION.texts, 'document').loadFailed
const ACTION_LABEL = applyCreditLabel('invoice')

// "Harbor Lane Bakery has $250.00 of unapplied credit on 2 credit memos." (spec §3.1).
function noticeText(customer: string, cents: number, count: number, currency: string): string {
    const memos = count === 1 ? '1 credit memo' : `${count} credit memos`
    return `${customer} has ${formatMoney(cents, currency)} of unapplied credit on ${memos}.`
}

// The invoice the dialog takes credit memos for, from its record; null for any other kind.
function invoiceTargetOf(record: DocumentRecord, partyName: string): ApplyCreditTarget | null {
    const fields = record.kindFields
    if (fields.kind !== 'invoice') return null
    return {
        kind: CREDIT_MEMO_APPLICATION,
        from: 'document',
        id: record.id,
        party: record.customer,
        partyName,
        number: record.number,
        date: record.date,
        balance: fields.balance,
        currency: record.currency,
        sourceInvoice: '',
    }
}

// The payments line alone, in the notice's box with no button: the customer has payments
// with an amount that is not applied and no unapplied credit.
function PaymentsOnlyNotice({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
    if (!isVisible) return null
    return (
        <View testID="invoice-unapplied-payments-notice" className={APPLY_NOTICE_BOX}>
            {children}
        </View>
    )
}

// The credits read failed: its notice with Retry, never "no unapplied credit".
function CreditsLoadError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <ListBanner
            testIdPrefix={CREDITS_LOAD_ID}
            message={CREDITS_LOAD_FAILED}
            onRetry={onRetry}
            isFlush
        />
    )
}

type InvoiceFrameProps = Pick<DocumentReadFrameProps, 'body' | 'section' | 'stamps'> & {
    target: ApplyCreditTarget
    status: DocumentRecord['status']
}

/**
 * The invoice's Details panel with its apply parts (apply credit spec §3.1, §3.3): the
 * notice "<customer> has <sum> of unapplied credit on <n> credit memos." with Apply credit,
 * and the payments line (UnappliedPaymentsLine) in the same box, or that line alone when the
 * customer has no unapplied credit; a failed credits read shows its notice with Retry. Then
 * the body, the kind's section, the apply dialog, the stamps. The notices are for a writer on
 * a posted invoice with an open balance (`customer`, else '' and the reads are off). The
 * credits read (useUnappliedCreditMemos) shares its query key with the read actions', so one
 * request serves both. The dialog is open while the store names this invoice and the invoice
 * can still take credit (a writer, posted, an open balance), or while its own write runs; it
 * stays open when the last credit memo leaves the list, so it shows its "no unapplied credit"
 * state. It closes when the screen loses focus. The payments line's links (a payment, the
 * customer page) are built here, on the screen, and handed to the notice's line and the
 * dialog's line, since the dialog's content gets no navigation on native.
 */
function InvoiceFrame({ target, status, body, section, stamps }: InvoiceFrameProps) {
    const { canWrite } = useBooksAccess()
    const canTakeCredit = canWrite && status === 'posted' && target.balance > 0
    const customer = canTakeCredit ? target.party : ''
    const credits = useUnappliedCreditMemos(customer)
    const payments = useUnappliedPayments(customer)
    const openDialog = useApplyCreditStore(state => state.open)
    const openFor = useApplyCreditStore(state => state.openFor)
    const isHeld = useApplyCreditStore(state => state.isHeld)
    useCloseOnBlur(target.id)
    const count = credits.credits.length
    const sum = credits.credits.reduce((total, memo) => total + memo.balance, 0)
    const hasCredit = credits.isReady && !credits.isError && count > 0
    const hasPayments = payments.isReady && !payments.isError && payments.payments.length > 0
    const isPaymentsOnly = credits.isReady && !credits.isError && count === 0 && hasPayments
    const isDialogVisible = openFor === target.id && (canTakeCredit || isHeld)
    const apply = () => openDialog(target.id)
    const text = noticeText(target.partyName, sum, count, target.currency)
    const retry = () => {
        void recoverLiveQueries({
            ...credits.recovery,
            onError: error => log.error(LOG_CONTEXT, error),
        })
    }
    const openPayment = useOpenDocumentById(PAYMENT_ROUTE)
    const openCustomerPage = useOpenCustomerPage()
    const openers: PaymentsLineOpeners = {
        onOpenPayment: openPayment,
        onOpenCustomer: () => openCustomerPage(target.party),
    }
    const paymentsLine = (
        <UnappliedPaymentsLine
            customerId={customer}
            currency={target.currency}
            testID="invoice-unapplied-payments"
            testIdPrefix="invoice-unapplied"
            openers={openers}
        />
    )
    return (
        <>
            <ApplyCreditNotice
                isVisible={hasCredit}
                testID={NOTICE_ID}
                text={text}
                actionLabel={ACTION_LABEL}
                onApply={apply}
            >
                {paymentsLine}
            </ApplyCreditNotice>
            <PaymentsOnlyNotice isVisible={isPaymentsOnly}>{paymentsLine}</PaymentsOnlyNotice>
            <CreditsLoadError isVisible={credits.isError} onRetry={retry} />
            {body}
            {section}
            <ApplyDialogSlot
                isVisible={isDialogVisible}
                target={target}
                sectionRecovery={credits.recovery}
                paymentsLineOpeners={openers}
            />
            {stamps}
        </>
    )
}

// A record that is not an invoice: the body, the section and the stamps alone.
function PlainFrame({
    body,
    section,
    stamps,
}: Pick<DocumentReadFrameProps, 'body' | 'section' | 'stamps'>) {
    return (
        <>
            {body}
            {section}
            {stamps}
        </>
    )
}

/**
 * The invoice's read view Details panel (the kind's ReadFrame; apply credit spec §3.1, §3.3):
 * the Apply credit notice with the payments line, the body, the invoice's sections, the apply
 * dialog that the read action, its key A and the notice open, then the stamps (InvoiceFrame).
 */
export function InvoiceApplyFrame({
    record,
    partyName,
    body,
    section,
    stamps,
}: DocumentReadFrameProps) {
    const target = invoiceTargetOf(record, partyName)
    if (target === null) return <PlainFrame body={body} section={section} stamps={stamps} />
    return (
        <InvoiceFrame
            target={target}
            status={record.status}
            body={body}
            section={section}
            stamps={stamps}
        />
    )
}
