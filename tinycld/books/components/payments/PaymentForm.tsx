import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useRecord } from '@tinycld/core/lib/use-record'
import { SelectInput } from '@tinycld/core/ui/form'
import { useMemo, useState } from 'react'
import type { FieldErrors } from 'react-hook-form'
import { Platform } from 'react-native'
import {
    type OutstandingInvoice,
    useOutstandingInvoices,
    useOutstandingLoader,
} from '../../hooks/useOutstandingInvoices'
import { usePaymentForm, usePaymentFormValues } from '../../hooks/usePaymentForm'
import { usePaymentSave } from '../../hooks/usePaymentSave'
import { usePaymentShortcuts } from '../../hooks/usePaymentShortcuts'
import { usePaymentWrites } from '../../hooks/usePaymentWrites'
import type { DepositAccountRow } from '../../lib/deposit-accounts'
import { paymentDepositOptions } from '../../lib/payment-deposit'
import { PAYMENT_FLOW } from '../../lib/payment-flow'
import type { PaymentFormValues } from '../../lib/payment-values'
import { FindInvoiceField, useFindInvoiceField } from './FindInvoiceField'
import { PaymentCustomerField } from './PaymentCustomerField'
import { PaymentFormView } from './PaymentFormView'

export interface PaymentFormProps {
    initial: PaymentFormValues
    title: string
    currency: string
    depositAccounts: DepositAccountRow[]
    // The saved draft's id; null for a new payment.
    paymentId: string | null
    // The draft's stored applications (live) and the invoices they name.
    storedLines: readonly { id: string; document: string; amount: number }[]
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

const FLOW = PAYMENT_FLOW
const AUTO_FOCUS = Platform.OS === 'web'

/**
 * The receive-payment form (spec §3): the received payment's reads (the customer's open
 * invoices, the customer's name), its Customer, Deposit to and Find invoice no. fields,
 * and the shared form view under PAYMENT_FLOW. The hooks run in the fixed order: the
 * form's values, the flow's reads, usePaymentForm, usePaymentSave, usePaymentShortcuts.
 */
export function PaymentForm({
    initial,
    title,
    currency,
    depositAccounts,
    paymentId,
    storedLines,
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
    const [depositStoredId] = useState(() => initial.account)
    const deposit = useMemo(
        () => paymentDepositOptions(depositAccounts, depositStoredId),
        [depositAccounts, depositStoredId]
    )
    const depositValues = useMemo(() => deposit.options.map(option => option.value), [deposit])
    const formValues = usePaymentFormValues({
        flow: FLOW,
        initial,
        currency,
        accountOptions: depositValues,
        initialErrors,
    })
    const party = formValues.values.party
    const outstanding = useOutstandingInvoices(party, storedInvoices, extraOpen)
    const loadOutstanding = useOutstandingLoader(storedInvoices, extraOpen)
    const [customersCollection] = useStore('books_customers')
    const customerRow = useRecord(customersCollection, party || null)
    const partyName = customerRow.record?.display_name ?? ''
    const paymentForm = usePaymentForm({
        flow: FLOW,
        formValues,
        currency,
        outstanding,
        loadOutstanding,
        partyName,
    })
    const writes = usePaymentWrites()
    const save = usePaymentSave(FLOW, writes, {
        paymentForm,
        currency,
        paymentId,
        storedLines,
        replaces,
        openedWithParty: openedWithCustomer,
        holdsHandOff,
    })
    const isSavedDraft = paymentId !== null
    const shortcuts = usePaymentShortcuts({
        flow: FLOW,
        scopeOwner,
        canWrite,
        isPending: save.isPending,
        isDialogOpen: save.isDiscardOpen || save.isDeleteOpen,
        isSavedDraft,
        isPhone,
        run: {
            payAll: paymentForm.onPayAll,
            toggleRow: paymentForm.onRowToggle,
            deleteDraft: save.openDeleteDraft,
            postAndNew: save.postAndNew,
        },
    })
    const { form } = paymentForm
    const find = useFindInvoiceField({
        customer: party,
        getCustomer: () => form.getValues('party'),
        onPicked: paymentForm.onFindPicked,
    })
    // A pick of another customer clears Find invoice no., so an old lookup text never
    // becomes a filter of the new customer's list.
    const pickCustomer = (id: string) => {
        if (id !== form.getValues('party')) find.clear()
        void paymentForm.onPartyPicked(id)
    }
    const isWriting = save.isPending
    const partyError = form.formState.errors.party?.message ?? ''
    const partyField = (
        <PaymentCustomerField
            value={party}
            name={partyName}
            error={partyError}
            isDisabled={isWriting || isCustomerLocked}
            hasFocusOnOpen={!isCustomerLocked}
            onPick={pickCustomer}
            onPicked={paymentForm.focusDate}
        />
    )
    const accountField = (
        <SelectInput
            name="account"
            control={form.control}
            label={FLOW.texts.accountLabel}
            options={deposit.options}
            placeholder={deposit.triggerLabel}
            disabled={isWriting}
            testID={`${FLOW.testId}-${FLOW.ids.account}`}
        />
    )
    const findField = <FindInvoiceField field={find} isFullWidth isDisabled={isWriting} />
    const view = {
        paymentForm,
        save,
        offered: shortcuts.offered,
        title,
        currency,
        isPhone,
        isSavedDraft,
        isDateFirst: AUTO_FOCUS && isCustomerLocked,
        filterText: find.filterText,
        scopeOwner,
    }
    return (
        <PaymentFormView
            flow={FLOW}
            form={view}
            partyField={partyField}
            accountField={accountField}
            findField={findField}
        />
    )
}
