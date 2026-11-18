import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useCallback, useMemo, useState } from 'react'
import type { FieldErrors } from 'react-hook-form'
import {
    type PaymentRowDates,
    usePaymentForm,
    usePaymentFormControl,
    usePaymentFormValues,
} from '../../hooks/usePaymentForm'
import { usePaymentSave } from '../../hooks/usePaymentSave'
import { usePaymentShortcuts } from '../../hooks/usePaymentShortcuts'
import { useRefundableCredits, useRefundableLoader } from '../../hooks/useRefundableCredits'
import { useVendorRefundWrites } from '../../hooks/useVendorRefundWrites'
import type { PaymentFormValues } from '../../lib/payment-values'
import { type RefundAccountRow, refundAccountOptions } from '../../lib/refund-accounts'
import type { RefundStoredLine } from '../../lib/refundable-credits'
import { VENDOR_REFUND_FLOW } from '../../lib/vendor-refund-flow'
import { vendorRefundSchema } from '../../lib/vendor-refund-schema'
import { PaymentFormView } from '../payments/PaymentFormView'
import { RefundAccountField } from './RefundAccountField'
import { VendorRefundVendorField } from './VendorRefundVendorField'

export interface VendorRefundFormProps {
    initial: PaymentFormValues
    title: string
    currency: string
    accounts: RefundAccountRow[]
    // An account's posted balance by id, from the screen's account read.
    balanceOf: (id: string) => number | null | undefined
    // The saved draft's id; null for a new refund (new or a correction).
    refundId: string | null
    // The draft's stored lines (live), which a save updates or removes.
    storedLines: readonly { id: string; document: string; amount: number }[]
    // The credits the draft's lines and a corrected original's lines name, which the list
    // shows even when they are no longer open.
    storedCredits: readonly RefundStoredLine[]
    replaces?: string
    // A correction keeps its original's vendor (spec §3.6): Vendor is read-only.
    isVendorLocked: boolean
    openedWithVendor?: string
    canWrite: boolean
    scopeOwner: ScopeOwner
    // A refusal the new form handed to this draft's form, as the form's start errors.
    initialErrors?: FieldErrors<PaymentFormValues>
    // This form shows a handed-off refusal: it clears the hand-off when it goes.
    holdsHandOff: boolean
}

const FLOW = VENDOR_REFUND_FLOW

const NO_CREDIT_DATES: Readonly<Record<string, string>> = {}

/**
 * The vendor refund form (vendor refund spec §3): the vendor's unapplied credits, its
 * Vendor and Refunded to fields, and the shared form view under VENDOR_REFUND_FLOW, with
 * no find field. The hooks run in the fixed order: the form's control, the credits read,
 * the form's values under `vendorRefundSchema` (the listed credits' dates through the
 * resolver's context), the vendor's name, usePaymentForm, usePaymentSave,
 * usePaymentShortcuts.
 */
export function VendorRefundForm({
    initial,
    title,
    currency,
    accounts,
    balanceOf,
    refundId,
    storedLines,
    storedCredits,
    replaces,
    isVendorLocked,
    openedWithVendor,
    canWrite,
    scopeOwner,
    initialErrors,
    holdsHandOff,
}: VendorRefundFormProps) {
    const isPhone = useBreakpoint() === 'mobile'
    // A stored inactive account shows by name only for the value the form mounted with.
    const [accountStoredId] = useState(() => initial.account)
    const account = useMemo(
        () => refundAccountOptions(accounts, accountStoredId),
        [accounts, accountStoredId]
    )
    const accountValues = useMemo(() => account.options.map(option => option.value), [account])
    // The credits read follows the drawn vendor, and its dates reach the schema in the
    // same render: the control comes first, then the read, then the form's rules.
    const { formControl, party } = usePaymentFormControl(initial)
    const credits = useRefundableCredits(party, storedCredits)
    const schemaOf = useCallback(
        (creditDates: PaymentRowDates) =>
            vendorRefundSchema(currency, accountValues, creditDates ?? NO_CREDIT_DATES),
        [currency, accountValues]
    )
    const formValues = usePaymentFormValues({
        initial,
        schemaOf,
        rowDates: credits.creditDates,
        formControl,
        initialErrors,
    })
    const loadCredits = useRefundableLoader(storedCredits)
    const [vendorsCollection] = useStore('books_vendors')
    const vendorRow = useRecord(vendorsCollection, party || null)
    const partyName = vendorRow.record?.display_name ?? ''
    const paymentForm = usePaymentForm({
        flow: FLOW,
        formValues,
        currency,
        outstanding: credits,
        loadOutstanding: loadCredits,
        partyName,
    })
    const writes = useVendorRefundWrites()
    const save = usePaymentSave(FLOW, writes, {
        paymentForm,
        currency,
        paymentId: refundId,
        storedLines,
        replaces,
        openedWithParty: openedWithVendor,
        holdsHandOff,
    })
    const isSavedDraft = refundId !== null
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
    const isWriting = save.isPending
    const errors = form.formState.errors
    const partyError = errors.party?.message ?? ''
    const accountError = errors.account?.message ?? ''
    const pickVendor = (id: string) => {
        void paymentForm.onPartyPicked(id)
    }
    const partyField = (
        <VendorRefundVendorField
            value={party}
            name={partyName}
            error={partyError}
            isDisabled={isWriting}
            isReadOnly={isVendorLocked}
            onPick={pickVendor}
            onPicked={paymentForm.focusDate}
        />
    )
    const accountField = (
        <RefundAccountField
            control={form.control}
            options={account.options}
            triggerLabel={account.triggerLabel}
            balanceOf={balanceOf}
            currency={currency}
            error={accountError}
            isDisabled={isWriting}
        />
    )
    const view = {
        paymentForm,
        save,
        offered: shortcuts.offered,
        title,
        currency,
        isPhone,
        isSavedDraft,
        // Vendor takes the first focus on every form, a correction's too (spec §3.2).
        isDateFirst: false,
        filterText: '',
        scopeOwner,
    }
    return (
        <PaymentFormView
            flow={FLOW}
            form={view}
            partyField={partyField}
            accountField={accountField}
            findField={null}
        />
    )
}
