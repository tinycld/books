import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { View } from 'react-native'
import type { DocumentRecord } from '../../hooks/document-data'
import type { ApplyCreditTarget } from '../../hooks/useApplyCredit'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useRemoveApplication } from '../../hooks/useRemoveApplication'
import { useVendorCreditSectionReads } from '../../hooks/vendor-credit-data'
import { applyCreditOffered, removeApplicationOffered } from '../../lib/document-actions'
import type { LiveRecovery } from '../../lib/live-recovery'
import { useApplyCreditStore } from '../../stores/apply-credit-store'
import { ApplyCreditDialog } from './ApplyCreditDialog'
import { ApplyCreditNotice } from './ApplyCreditNotice'
import { DocumentApplications, RemoveApplicationDialog } from './DocumentApplications'
import type { DocumentReadFrameProps } from './document-kinds'

type SectionReads = ReturnType<typeof useVendorCreditSectionReads>

// The credit the dialog applies, from a vendor credit's record; null for any other kind.
function applyTargetOf(record: DocumentRecord): ApplyCreditTarget | null {
    const fields = record.kindFields
    if (fields.kind !== 'vendor_credit') return null
    return {
        id: record.id,
        vendor: fields.vendor,
        vendorName: fields.vendorRow?.display_name ?? '',
        number: record.number,
        date: record.date,
        balance: fields.balance,
        currency: record.currency,
    }
}

function ApplyDialogSlot({
    isVisible,
    credit,
    sectionRecovery,
}: {
    isVisible: boolean
    credit: ApplyCreditTarget
    sectionRecovery: LiveRecovery
}) {
    if (!isVisible) return null
    return <ApplyCreditDialog credit={credit} sectionRecovery={sectionRecovery} />
}

function ApplySection({
    credit,
    status,
    canWrite,
    isOffered,
    reads,
}: {
    credit: ApplyCreditTarget
    status: DocumentRecord['status']
    canWrite: boolean
    isOffered: boolean
    reads: SectionReads
}) {
    const { applications, openBills } = reads
    const canRemove = removeApplicationOffered(canWrite, status)
    const removal = useRemoveApplication({ applications: applications.applications, canRemove })
    const openFor = useApplyCreditStore(state => state.openFor)
    const isHeld = useApplyCreditStore(state => state.isHeld)
    const closeDialog = useApplyCreditStore(state => state.close)
    // The dialog belongs to this screen: it closes when the screen loses focus, so it does
    // not stand open over the screen pushed on top or reopen on the way back.
    const creditId = credit.id
    useFocusEffect(
        useCallback(
            () => () => {
                if (useApplyCreditStore.getState().openFor === creditId) closeDialog()
            },
            [creditId, closeDialog]
        )
    )

    // Open while the store names this credit and Apply is still offered (the credit was not
    // voided or applied elsewhere meanwhile), or while its own write runs.
    const isDialogVisible = openFor === creditId && (isOffered || isHeld)
    return (
        <View className="gap-4">
            <DocumentApplications
                applications={applications.applications}
                isReady={applications.isReady}
                isError={applications.isError}
                onRetry={reads.retry}
                currency={credit.currency}
                testIdPrefix="vendor-credit"
                canRemove={canRemove}
                onRemove={removal.ask}
            />
            <ApplyDialogSlot
                isVisible={isDialogVisible}
                credit={credit}
                sectionRecovery={openBills.read.recovery}
            />
            <RemoveApplicationDialog
                application={removal.target}
                isVisible={removal.isVisible}
                currency={credit.currency}
                isPending={removal.isPending}
                errorMessage={removal.errorMessage}
                onConfirm={removal.confirm}
                onCancel={removal.cancel}
            />
        </View>
    )
}

function ApplyNotice({
    credit,
    isOffered,
    reads,
}: {
    credit: ApplyCreditTarget
    isOffered: boolean
    reads: SectionReads
}) {
    const openDialog = useApplyCreditStore(state => state.open)
    const bills = reads.openBills.read
    const count = reads.openBills.rows.length
    const isVisible = isOffered && bills.isReady && !bills.isError && count > 0
    const apply = () => openDialog(credit.id)
    return (
        <ApplyCreditNotice
            isVisible={isVisible}
            vendorName={credit.vendorName}
            openBills={count}
            onApply={apply}
        />
    )
}

// The frame of one vendor credit: one run of its section reads, given to the notice and to
// the section, so a Retry that recovers the open-bills read brings the notice back too.
function CreditReadFrame({
    credit,
    status,
    body,
    stamps,
}: {
    credit: ApplyCreditTarget
    status: DocumentRecord['status']
    body: DocumentReadFrameProps['body']
    stamps: DocumentReadFrameProps['stamps']
}) {
    const { canWrite } = useBooksAccess()
    // Apply is offered only to a writer on a posted credit; elsewhere the open-bills read
    // never runs.
    const canApply = canWrite && status === 'posted'
    const reads = useVendorCreditSectionReads({ id: credit.id, vendor: credit.vendor, canApply })
    const isOffered = canWrite && applyCreditOffered('vendor_credit', status, credit.balance)
    return (
        <>
            <ApplyNotice credit={credit} isOffered={isOffered} reads={reads} />
            {body}
            <ApplySection
                credit={credit}
                status={status}
                canWrite={canWrite}
                isOffered={isOffered}
                reads={reads}
            />
            {stamps}
        </>
    )
}

/**
 * The vendor credit's read view Details panel (the kind's ReadFrame): the notice above the
 * band (vendor credit spec §3.7: "<vendor> has <n> open bills." with Apply to bills, which
 * opens the apply dialog through `useApplyCreditStore`), the body, then the section (spec
 * §3.9: the Applied to block with Remove and its confirm, and the apply dialog that the read
 * action, its key A and the notice open), then the stamps. The notice and the section share
 * one run of `useVendorCreditSectionReads`. Both read `useBooksAccess()` here, as the read
 * actions do.
 */
export function VendorCreditReadFrame({ record, body, stamps }: DocumentReadFrameProps) {
    const credit = applyTargetOf(record)
    if (credit === null) {
        return (
            <>
                {body}
                {stamps}
            </>
        )
    }
    return <CreditReadFrame credit={credit} status={record.status} body={body} stamps={stamps} />
}
