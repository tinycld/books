import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useFocusEffect } from 'expo-router'
import { useCallback, useMemo } from 'react'
import type { DocumentRecord } from '../../hooks/document-data'
import type { ApplyCreditTarget } from '../../hooks/useApplyCredit'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useCreditApplications } from '../../hooks/useCreditApplications'
import type { CreditRefundRow, CreditRefunds } from '../../hooks/useCreditRefunds'
import { useOpenBills } from '../../hooks/useOpenBills'
import { type OutstandingInvoice, useOutstandingInvoices } from '../../hooks/useOutstandingInvoices'
import { useRemoveApplication } from '../../hooks/useRemoveApplication'
import { applyNoticeVisible } from '../../lib/apply-credit-schema'
import {
    applyCreditLabel,
    CREDIT_MEMO_APPLICATION,
    type CreditApplicationKind,
    VENDOR_CREDIT_APPLICATION,
} from '../../lib/credit-application-kinds'
import { creditUseRows } from '../../lib/credit-uses'
import { applyCreditOffered, removeApplicationOffered } from '../../lib/document-actions'
import { type LiveRecovery, mergeRecoveries } from '../../lib/live-recovery'
import { fillPaymentText } from '../../lib/payment-texts'
import { useApplyCreditStore } from '../../stores/apply-credit-store'
import { ApplyCreditDialog } from './ApplyCreditDialog'
import { ApplyCreditNotice } from './ApplyCreditNotice'
import { DocumentApplications, RemoveApplicationDialog } from './DocumentApplications'
import type { DocumentReadFrameProps } from './document-kinds'
import type { PaymentsLineOpeners } from './UnappliedPaymentsLine'

const LOG_CONTEXT = 'books.creditApply'
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_STORED_INVOICES: readonly OutstandingInvoice[] = []
const NO_REFUNDS: readonly CreditRefundRow[] = []

// What the frame of each credit kind draws in its own words: the block's and the notice's
// test id prefix (the credit's own), and the notice's count of open documents and its rest.
const FRAME_TEXTS = {
    vendor_credit: {
        testIdPrefix: 'vendor-credit',
        openOne: '1 open bill',
        openMany: '%s open bills',
        noticeRest: 'Apply this credit to lower what you pay.',
    },
    credit_memo: {
        testIdPrefix: 'credit-memo',
        openOne: '1 open invoice',
        openMany: '%s open invoices',
        noticeRest: 'Apply this credit to lower what they owe.',
    },
} as const satisfies Record<CreditApplicationKind['key'], unknown>

// "Pacific Power has 2 open bills. Apply this credit to lower what you pay." (vendor credit
// spec §3.7), "Harbor Lane Bakery has 2 open invoices. Apply this credit to lower what they
// owe." (apply credit spec §3.1).
function noticeText(kind: CreditApplicationKind, partyName: string, count: number): string {
    const texts = FRAME_TEXTS[kind.key]
    const open = count === 1 ? texts.openOne : fillPaymentText(texts.openMany, String(count))
    return `${partyName} has ${open}. ${texts.noticeRest}`
}

/**
 * The reads of a credit's read frame (vendor credit spec §4 Client reads, vendor refund spec
 * §3.9, apply credit spec §4.4 Reads), run once for its notice and its Applied to block:
 * the credit's applications of the kind (useCreditApplications), merged for a vendor credit
 * with its posted vendor refunds (`refunds`, the read view's one read of them) into the
 * block's rows in date order (creditUseRows; a credit memo's refunds stay in its own Refund
 * receipts section, so its rows are its applications), and the party's open documents for
 * the notice (a vendor's open bills, useOpenBills; a customer's open invoices, of this
 * customer only, useOutstandingInvoices). The open-documents read runs only while Apply
 * can be offered (`canApply`: a writer on a posted credit). None is the screen's read: the
 * credit still shows when one fails. The block waits for its reads and shows one load
 * error when one fails; its Retry recovers every failed read in one call; the apply
 * dialog's Retry takes the open-documents read's recovery too (`open.read.recovery`), so
 * either Retry brings the notice back.
 */
function useCreditSectionReads(
    kind: CreditApplicationKind,
    credit: { id: string; party: string; canApply: boolean; refunds: CreditRefunds }
) {
    const isVendor = kind.key === 'vendor_credit'
    const applications = useCreditApplications(kind, { credit: credit.id })
    const openBills = useOpenBills({ vendor: credit.party, isEnabled: isVendor && credit.canApply })
    const invoices = useOutstandingInvoices(
        !isVendor && credit.canApply ? credit.party : '',
        NO_STORED_INVOICES
    )
    const open = isVendor
        ? { count: openBills.rows.length, read: openBills.read }
        : { count: invoices.rows.length, read: invoices }
    const refunds = isVendor
        ? credit.refunds
        : { refunds: NO_REFUNDS, isReady: true, isError: false, recovery: NO_RECOVERY }
    const refundRows = refunds.refunds
    const rows = useMemo(
        () => creditUseRows(applications.applications, refundRows),
        [applications.applications, refundRows]
    )
    const uses = {
        rows,
        isReady: applications.isReady && refunds.isReady,
        isError: applications.isError || refunds.isError,
    }
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([applications.recovery, refunds.recovery, open.read.recovery]),
            onError: error => log.error(LOG_CONTEXT, error),
        })
    }
    return { applications, uses, open, retry }
}

type SectionReads = ReturnType<typeof useCreditSectionReads>

// The dialog belongs to this screen: it closes when the screen loses focus, so it does not
// stand open over the screen pushed on top or reopen on the way back. `recordId` is the
// credit's or the invoice's id (the store's `openFor`).
export function useCloseOnBlur(recordId: string) {
    const closeDialog = useApplyCreditStore(state => state.close)
    useFocusEffect(
        useCallback(
            () => () => {
                if (useApplyCreditStore.getState().openFor === recordId) closeDialog()
            },
            [recordId, closeDialog]
        )
    )
}

// The apply dialog while `isVisible`; nothing otherwise. The credit's and the invoice's read
// frames mount it; the invoice's hands in its payments line's openers.
export function ApplyDialogSlot({
    isVisible,
    target,
    sectionRecovery,
    paymentsLineOpeners,
}: {
    isVisible: boolean
    target: ApplyCreditTarget
    sectionRecovery: LiveRecovery
    paymentsLineOpeners?: PaymentsLineOpeners
}) {
    if (!isVisible) return null
    return (
        <ApplyCreditDialog
            target={target}
            sectionRecovery={sectionRecovery}
            paymentsLineOpeners={paymentsLineOpeners}
        />
    )
}

function ApplyNotice({
    target,
    status,
    canWrite,
    reads,
}: {
    target: ApplyCreditTarget
    status: DocumentRecord['status']
    canWrite: boolean
    reads: SectionReads
}) {
    const openDialog = useApplyCreditStore(state => state.open)
    const { count, read } = reads.open
    const isVisible =
        read.isReady &&
        !read.isError &&
        applyNoticeVisible({ canWrite, status, balance: target.balance, openCount: count })
    const apply = () => openDialog(target.id)
    const testID = `${FRAME_TEXTS[target.kind.key].testIdPrefix}-apply-notice`
    return (
        <ApplyCreditNotice
            isVisible={isVisible}
            testID={testID}
            text={noticeText(target.kind, target.partyName, count)}
            actionLabel={applyCreditLabel(target.kind.key)}
            onApply={apply}
        />
    )
}

type CreditReadFrameProps = Pick<
    DocumentReadFrameProps,
    'body' | 'section' | 'stamps' | 'refunds'
> & {
    target: ApplyCreditTarget
    status: DocumentRecord['status']
}

/**
 * The frame of one credit of either kind (plan decision 6): the notice above the band, the
 * body, the Applied to block (with each application's Remove for a writer on a posted
 * credit), the kind's own section (`section`: a credit memo's Refund receipts), the apply
 * dialog and Remove's confirm, then the stamps. The notice and the block share one run of
 * useCreditSectionReads. The dialog is open while the store names this credit and Apply is
 * still offered (the credit was not voided or applied elsewhere meanwhile), or while its
 * own write runs. Access is read here (useBooksAccess), as the read actions do.
 */
function CreditReadFrame({ target, status, body, section, stamps, refunds }: CreditReadFrameProps) {
    const { kind } = target
    const { canWrite } = useBooksAccess()
    // Apply is offered only to a writer on a posted credit; elsewhere the open-documents read
    // never runs.
    const canApply = canWrite && status === 'posted'
    const reads = useCreditSectionReads(kind, {
        id: target.id,
        party: target.party,
        canApply,
        refunds,
    })
    const isOffered = canWrite && applyCreditOffered(kind.key, status, target.balance)
    const canRemove = removeApplicationOffered(canWrite, status)
    const removal = useRemoveApplication(kind, {
        applications: reads.applications.applications,
        canRemove,
    })
    const openFor = useApplyCreditStore(state => state.openFor)
    const isHeld = useApplyCreditStore(state => state.isHeld)
    useCloseOnBlur(target.id)
    const isDialogVisible = openFor === target.id && (isOffered || isHeld)
    return (
        <>
            <ApplyNotice target={target} status={status} canWrite={canWrite} reads={reads} />
            {body}
            <DocumentApplications
                uses={reads.uses.rows}
                rowTarget={kind.documentTarget}
                isReady={reads.uses.isReady}
                isError={reads.uses.isError}
                onRetry={reads.retry}
                currency={target.currency}
                testIdPrefix={FRAME_TEXTS[kind.key].testIdPrefix}
                canRemove={canRemove}
                onRemove={removal.ask}
            />
            {section}
            <ApplyDialogSlot
                isVisible={isDialogVisible}
                target={target}
                sectionRecovery={reads.open.read.recovery}
            />
            <RemoveApplicationDialog
                application={removal.target}
                removeBody={kind.texts.removeBody}
                isVisible={removal.isVisible}
                currency={target.currency}
                isPending={removal.isPending}
                errorMessage={removal.errorMessage}
                onConfirm={removal.confirm}
                onCancel={removal.cancel}
            />
            {stamps}
        </>
    )
}

// A record that is not of the frame's kind: the body, the section and the stamps alone.
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

// The vendor credit the dialog applies, from its record; null for any other kind.
function vendorCreditTargetOf(record: DocumentRecord): ApplyCreditTarget | null {
    const fields = record.kindFields
    if (fields.kind !== 'vendor_credit') return null
    return {
        kind: VENDOR_CREDIT_APPLICATION,
        from: 'credit',
        id: record.id,
        party: fields.vendor,
        partyName: fields.vendorRow?.display_name ?? '',
        number: record.number,
        date: record.date,
        balance: fields.balance,
        currency: record.currency,
        sourceInvoice: '',
    }
}

// The credit memo the dialog applies, from its record; null for any other kind.
function creditMemoTargetOf(record: DocumentRecord, partyName: string): ApplyCreditTarget | null {
    const fields = record.kindFields
    if (fields.kind !== 'credit_memo') return null
    return {
        kind: CREDIT_MEMO_APPLICATION,
        from: 'credit',
        id: record.id,
        party: record.customer,
        partyName,
        number: record.number,
        date: record.date,
        balance: fields.balance,
        currency: record.currency,
        sourceInvoice: fields.invoice,
    }
}

/**
 * The vendor credit's read view Details panel (the kind's ReadFrame; vendor credit spec
 * §3.7, §3.9, vendor refund spec §3.9): the notice "<vendor> has <n> open bills." with
 * Apply to bills, the body, the Applied to block (applications and posted vendor refunds,
 * `refunds`), the apply dialog that the read action, its key A and the notice open, and
 * Remove's confirm, then the stamps (CreditReadFrame).
 */
export function VendorCreditReadFrame({
    record,
    body,
    section,
    stamps,
    refunds,
}: DocumentReadFrameProps) {
    const target = vendorCreditTargetOf(record)
    if (target === null) return <PlainFrame body={body} section={section} stamps={stamps} />
    return (
        <CreditReadFrame
            target={target}
            status={record.status}
            body={body}
            section={section}
            stamps={stamps}
            refunds={refunds}
        />
    )
}

/**
 * The credit memo's read view Details panel (the kind's ReadFrame; apply credit spec §3.1,
 * §3.2, §3.5, §3.7): the notice "<customer> has <n> open invoices." with Apply to invoices,
 * the body, the Applied to block (its applications, with Remove), the Refund receipts
 * section (`section`), the apply dialog, whose list puts the invoice the memo was made from
 * first (`sourceInvoice`), and Remove's confirm, then the stamps (CreditReadFrame).
 */
export function CreditMemoReadFrame({
    record,
    partyName,
    body,
    section,
    stamps,
    refunds,
}: DocumentReadFrameProps) {
    const target = creditMemoTargetOf(record, partyName)
    if (target === null) return <PlainFrame body={body} section={section} stamps={stamps} />
    return (
        <CreditReadFrame
            target={target}
            status={record.status}
            body={body}
            section={section}
            stamps={stamps}
            refunds={refunds}
        />
    )
}
