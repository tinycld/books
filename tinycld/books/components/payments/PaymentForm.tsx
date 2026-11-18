import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { FormErrorSummary, TextAreaInput } from '@tinycld/core/ui/form'
import { useMemo, useState } from 'react'
import type { FieldErrors } from 'react-hook-form'
import { ScrollView, View } from 'react-native'
import { useFormLeaveGuard } from '../../hooks/useFormLeaveGuard'
import type { OutstandingInvoice } from '../../hooks/useOutstandingInvoices'
import { usePaymentForm } from '../../hooks/usePaymentForm'
import { usePaymentSave } from '../../hooks/usePaymentSave'
import { usePaymentShortcuts } from '../../hooks/usePaymentShortcuts'
import type { DepositAccountRow } from '../../lib/deposit-accounts'
import { INVOICE_OUTSTANDING } from '../../lib/outstanding-documents'
import { paymentDepositOptions } from '../../lib/payment-deposit'
import { paymentFigureText } from '../../lib/payment-texts'
import type { PaymentFormValues } from '../../lib/payment-values'
import { todayIso } from '../../lib/register-range'
import { rootErrorOnly } from '../../lib/root-errors'
import { DocumentActionBar } from '../documents/DocumentActionBar'
import { DocumentHeader } from '../documents/DocumentHeader'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { DiscardDialog } from '../entries/DiscardDialog'
import { EntryBackLink } from '../entries/EntryHeader'
import { EntryLeaveContext } from '../entries/EntryLeaveContext'
import { ClearPaymentsLink } from './ClearPaymentsLink'
import { useFindInvoiceField } from './FindInvoiceField'
import { OutstandingInvoices, outstandingListMode } from './OutstandingInvoices'
import { PaymentBand } from './PaymentBand'
import { PaymentTotals } from './PaymentTotals'

export interface PaymentFormProps {
    initial: PaymentFormValues
    title: string
    currency: string
    depositAccounts: DepositAccountRow[]
    // The saved draft's id; null for a new payment.
    paymentId: string | null
    // The draft's stored applications (live) and the invoices they name.
    storedApplications: readonly { id: string; invoice: string; amount: number }[]
    storedInvoices: readonly OutstandingInvoice[]
    extraOpen?: Readonly<Record<string, number>>
    replaces?: string
    // A correction keeps its original's customer (spec §3.6): Customer cannot change, and
    // the first focus is Payment date.
    isCustomerLocked: boolean
    openedWithCustomer?: string
    canWrite: boolean
    scopeOwner: ScopeOwner
    // A refusal the new form handed to this draft's form, as the form's start errors.
    initialErrors?: FieldErrors<PaymentFormValues>
    // This form shows a handed-off refusal: it clears the hand-off when it goes.
    holdsHandOff: boolean
}

const MEMO_WIDE = { maxWidth: 560 }

/**
 * The receive-payment form (spec §3): header, band, outstanding list, Clear payments,
 * totals, memo and the shared action bar, with the Discard and Delete draft dialogs.
 */
export function PaymentForm({
    initial,
    title,
    currency,
    depositAccounts,
    paymentId,
    storedApplications,
    storedInvoices,
    extraOpen,
    replaces,
    isCustomerLocked,
    openedWithCustomer,
    canWrite,
    scopeOwner,
    initialErrors,
    holdsHandOff,
}: PaymentFormProps) {
    const isPhone = useBreakpoint() === 'mobile'
    // A stored inactive account shows by name only for the value the form mounted with.
    const [depositStoredId] = useState(() => initial.deposit_to)
    const deposit = useMemo(
        () => paymentDepositOptions(depositAccounts, depositStoredId),
        [depositAccounts, depositStoredId]
    )
    const depositValues = useMemo(() => deposit.options.map(option => option.value), [deposit])
    const paymentForm = usePaymentForm({
        initial,
        currency,
        depositOptions: depositValues,
        storedInvoices,
        extraOpen,
        initialErrors,
    })
    const save = usePaymentSave({
        paymentForm,
        currency,
        paymentId,
        storedApplications,
        replaces,
        openedWithCustomer,
        holdsHandOff,
    })
    const isSavedDraft = paymentId !== null
    const leaveGuard = useFormLeaveGuard({
        isDirty: save.isDirty,
        isWriting: save.isPending || save.isLeaving,
        cancel: save.cancel,
        leave: save.leave,
        question: {
            isOpen: save.isDiscardOpen,
            discard: save.discard,
            keepEditing: save.keepEditing,
        },
    })
    const shortcuts = usePaymentShortcuts({
        scopeOwner,
        canWrite,
        isPending: save.isPending,
        isDialogOpen: leaveGuard.dialog.isVisible || save.isDeleteOpen,
        isSavedDraft,
        isPhone,
        run: {
            payAll: paymentForm.onPayAll,
            toggleRow: paymentForm.onRowToggle,
            deleteDraft: save.openDeleteDraft,
            postAndNew: save.postAndNew,
        },
    })
    const { form, values, outstanding, totals } = paymentForm
    const find = useFindInvoiceField({
        customer: values.customer,
        getCustomer: () => form.getValues('customer'),
        onPicked: paymentForm.onFindPicked,
    })
    // A pick of another customer clears Find invoice no., so an old lookup text never
    // becomes a filter of the new customer's list.
    const onCustomerPicked = (id: string) => {
        if (id !== form.getValues('customer')) find.clear()
        return paymentForm.onCustomerPicked(id)
    }
    const band = { ...paymentForm, onCustomerPicked }
    // A running save, delete or post: every control waits for it, so an edit made during
    // the write is not lost when the form resets to what it submitted.
    const isWriting = save.isPending
    const errors = form.formState.errors
    const rowErrors = Object.fromEntries(
        outstanding.rows.map(row => [row.id, errors.payments?.[row.id]?.amount?.message ?? ''])
    )
    const listMode = outstandingListMode({
        customer: values.customer,
        isReady: outstanding.isReady,
        isError: outstanding.isError,
        rowCount: outstanding.rows.length,
    })
    const hasTotals = listMode === 'rows' || listMode === 'none'
    const isClearDisabled = isWriting || !shortcuts.offered.includes('clearPayments')
    const figure = paymentFigureText(values.amount, currency)
    const summaryErrors = rootErrorOnly(errors)
    const memoStyle = isPhone ? undefined : MEMO_WIDE
    const list = {
        doc: INVOICE_OUTSTANDING,
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
            <View testID="payment-form" className="min-w-0 flex-1 bg-background">
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
                        testID="payment-error-summary"
                        isEnabled
                    />
                    <PaymentBand
                        paymentForm={band}
                        depositOptions={deposit.options}
                        depositTriggerLabel={deposit.triggerLabel}
                        isPhone={isPhone}
                        isDisabled={isWriting}
                        isCustomerLocked={isCustomerLocked}
                    />
                    <OutstandingInvoices
                        mode={listMode}
                        customerName={paymentForm.customerName}
                        onRetry={outstanding.retry}
                        find={find}
                        list={list}
                    />
                    <ClearPaymentsLink
                        isVisible={listMode === 'rows'}
                        isDisabled={isClearDisabled}
                        onPress={paymentForm.onClear}
                        scopeOwner={scopeOwner}
                        linkRef={paymentForm.clearRef}
                    />
                    <PaymentTotals
                        isVisible={hasTotals}
                        apply={totals.apply}
                        credit={totals.credit}
                        creditNote={totals.creditNote}
                        over={totals.over}
                    />
                    <View style={memoStyle}>
                        <TextAreaInput
                            name="memo"
                            control={form.control}
                            label="Internal memo (not printed)"
                            maxLength={4000}
                            editable={!isWriting}
                            testID="payment-memo"
                        />
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
                    body="The draft payment is deleted. This cannot be undone."
                />
            </View>
        </EntryLeaveContext.Provider>
    )
}
