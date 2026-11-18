import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { FormErrorSummary, TextAreaInput } from '@tinycld/core/ui/form'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { PaymentFormState } from '../../hooks/usePaymentForm'
import type { PaymentLeaveGuard, PaymentSave } from '../../hooks/usePaymentSave'
import type { PaymentFlow } from '../../lib/payment-flow'
import type { PaymentFormKey } from '../../lib/payment-shortcuts'
import { paymentFigureText } from '../../lib/payment-texts'
import { todayIso } from '../../lib/register-range'
import { rootErrorOnly } from '../../lib/root-errors'
import { DocumentActionBar } from '../documents/DocumentActionBar'
import { DocumentHeader } from '../documents/DocumentHeader'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { DiscardDialog } from '../entries/DiscardDialog'
import { EntryBackLink } from '../entries/EntryHeader'
import { EntryLeaveContext } from '../entries/EntryLeaveContext'
import { ClearPaymentsLink } from './ClearPaymentsLink'
import { OutstandingInvoices, outstandingListMode } from './OutstandingInvoices'
import { PaymentBand } from './PaymentBand'
import { PaymentTotals } from './PaymentTotals'

// What a flow's form component hands the shared view: its form, save and keys (called in
// the fixed order: the flow's reads, usePaymentForm, usePaymentSave, usePaymentShortcuts),
// and the screen's facts.
export interface PaymentFormViewState {
    paymentForm: PaymentFormState
    save: PaymentSave
    // The leave guard over the save (usePaymentLeaveGuard): Cancel, Back and the Discard
    // dialog go through it.
    leaveGuard: PaymentLeaveGuard
    // The form keys offered now (usePaymentShortcuts).
    offered: readonly PaymentFormKey[]
    title: string
    currency: string
    isPhone: boolean
    // The form shows a saved draft: More holds Delete draft.
    isSavedDraft: boolean
    // The date takes the first focus on web.
    isDateFirst: boolean
    // The find field's filter text; '' for a flow with no find field.
    filterText: string
    scopeOwner: ScopeOwner
}

interface PaymentFormViewProps {
    flow: PaymentFlow
    form: PaymentFormViewState
    // The party and account fields, built by the flow's screen.
    partyField: ReactNode
    accountField: ReactNode
    // The received payment's Find invoice no. field; null draws none (and no "no match"
    // state).
    findField: ReactNode | null
}

const MEMO_WIDE = { maxWidth: 560 }

// The memo's hint line under the field; nothing when the flow has none.
function MemoHint({ text, testID }: { text: string; testID: string }) {
    if (text === '') return null
    return (
        <Text testID={testID} className="mt-1 text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

/**
 * A payment form (receive-payment spec §3, vendor refund spec §3): header, band, the
 * party's open documents, the clear link, the flow's totals, memo and the shared action
 * bar, with the Discard and Delete draft dialogs. The flow gives every text and test id.
 */
export function PaymentFormView({
    flow,
    form,
    partyField,
    accountField,
    findField,
}: PaymentFormViewProps) {
    const { paymentForm, save, leaveGuard, offered, title, currency, isPhone, isSavedDraft } = form
    const { scopeOwner } = form
    const { texts, testId } = flow
    const { values, outstanding, totals } = paymentForm
    // A running save, delete or post: every control waits for it, so an edit made during
    // the write is not lost when the form resets to what it submitted.
    const isWriting = save.isPending
    const errors = paymentForm.form.formState.errors
    const rowErrors = Object.fromEntries(
        outstanding.rows.map(row => [row.id, errors.payments?.[row.id]?.amount?.message ?? ''])
    )
    const listMode = outstandingListMode({
        party: values.party,
        isReady: outstanding.isReady,
        isError: outstanding.isError,
        rowCount: outstanding.rows.length,
    })
    const hasTotals = listMode === 'rows' || listMode === 'none'
    // A party with no open document: the 'credit' rule keeps the amount as credit, so its
    // lines say so; under 'exact' nothing can be placed, so only the sum refusal is drawn.
    const hasTotalLines = listMode === 'rows' || flow.sumRule === 'credit'
    const isClearDisabled = isWriting || !offered.includes('clearPayments')
    const figure = paymentFigureText(values.amount, currency)
    const summaryErrors = rootErrorOnly(errors)
    const memoStyle = isPhone ? undefined : MEMO_WIDE
    const list = {
        doc: flow.doc,
        rows: outstanding.rows,
        payments: values.payments,
        rowErrors,
        currency,
        today: todayIso(),
        isDisabled: isWriting,
        onTick: paymentForm.onRowTick,
        onTickAll: paymentForm.onTickAll,
        onType: paymentForm.onRowType,
        onNext: paymentForm.focusAfterRow,
        onFocusRow: (rowId: string | null) => {
            paymentForm.focusedRowRef.current = rowId
        },
        rowRef: paymentForm.rowRef,
    }
    return (
        <EntryLeaveContext.Provider value={leaveGuard.cancel}>
            <View testID={`${testId}-form`} className="min-w-0 flex-1 bg-background">
                <ScrollView
                    className="flex-1"
                    contentContainerClassName="gap-4 px-4 pt-2 pb-6"
                    keyboardShouldPersistTaps="handled"
                >
                    <EntryBackLink />
                    <DocumentHeader
                        title={title}
                        status="draft"
                        figure={figure}
                        isExpired={false}
                    />
                    <FormErrorSummary
                        errors={summaryErrors}
                        title={null}
                        variant="destructive"
                        showFieldNames={false}
                        testID={`${testId}-error-summary`}
                        isEnabled
                    />
                    <PaymentBand
                        flow={flow}
                        paymentForm={paymentForm}
                        partyField={partyField}
                        accountField={accountField}
                        isPhone={isPhone}
                        isDisabled={isWriting}
                        isDateFirst={form.isDateFirst}
                    />
                    <OutstandingInvoices
                        flow={flow}
                        mode={listMode}
                        partyId={values.party}
                        partyName={paymentForm.partyName}
                        onRetry={outstanding.retry}
                        findField={findField}
                        filterText={form.filterText}
                        list={list}
                    />
                    <ClearPaymentsLink
                        isVisible={listMode === 'rows'}
                        isDisabled={isClearDisabled}
                        onPress={paymentForm.onClear}
                        scopeOwner={scopeOwner}
                        linkRef={paymentForm.clearRef}
                        label={texts.clearLabel}
                        description={texts.clearDescription}
                    />
                    <PaymentTotals
                        isVisible={hasTotals}
                        hasLines={hasTotalLines}
                        flow={flow}
                        lines={totals.lines}
                        partyName={paymentForm.partyName}
                        sumError={totals.sumError}
                    />
                    <View style={memoStyle}>
                        <TextAreaInput
                            name="memo"
                            control={paymentForm.form.control}
                            label={texts.memoLabel}
                            maxLength={4000}
                            editable={!isWriting}
                            testID={`${testId}-memo`}
                        />
                        <MemoHint text={texts.memoHint} testID={`${testId}-memo-hint`} />
                    </View>
                </ScrollView>
                <DocumentActionBar
                    isSaving={save.isPending}
                    canDeleteDraft={isSavedDraft}
                    isPhone={isPhone}
                    onCancel={leaveGuard.cancel}
                    onSaveDraft={save.saveDraft}
                    onPost={save.post}
                    onPostAndNew={save.postAndNew}
                    onDeleteDraft={save.openDeleteDraft}
                    scopeOwner={scopeOwner}
                />
                <DiscardDialog title="Discard changes?" {...leaveGuard.dialog} />
                <DeleteDraftDialog
                    isVisible={save.isDeleteOpen}
                    onConfirm={save.confirmDelete}
                    onCancel={save.closeDeleteDraft}
                    isPending={save.isDeletePending}
                    errorMessage={save.deleteError}
                    body={texts.deleteDraftBody}
                />
            </View>
        </EntryLeaveContext.Provider>
    )
}
