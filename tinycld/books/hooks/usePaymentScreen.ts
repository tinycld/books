import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useRef } from 'react'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { type PaymentScreenState, paymentScreenState } from '../lib/payment-screen-state'
import { usePaymentSaveStore } from '../stores/payment-save-store'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useDepositAccounts } from './useDepositAccounts'
import { type PaymentRow, usePaymentRecord } from './usePaymentRecord'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type PaymentScreenInput = {
    // The payment's id; null at `books/payments/new`.
    id: string | null
    // `?replaces`: the posted payment a new form corrects.
    replaces?: string
    // `?customer` and `?invoice` start a new form.
    customer?: string
    invoice?: string
}

// The invoice `?invoice` names, which a new form ticks for its open balance.
function useStartInvoice(invoiceId: string) {
    const [invoicesCollection] = useStore('books_invoices')
    const query = useLiveQuery({
        query: q => {
            if (!invoiceId) return undefined
            return q
                .from({ invoice: invoicesCollection })
                .where(({ invoice }) => eq(invoice.id, invoiceId))
                .findOne()
        },
        queryKey: ['books.payment.startInvoice', invoiceId],
    })
    const isError = !!invoiceId && query.isError
    return {
        invoice: invoiceId ? (query.data ?? null) : null,
        isReady: !invoiceId || query.isReady || isError,
        isError,
        recovery: isError
            ? { queries: [query.collection], sources: [invoicesCollection] }
            : NO_RECOVERY,
    }
}

// While a post or delete holds the payment, the last row read stands in for an optimistic
// change (a delete removes the row before the server answers), so the form stays up and
// a refusal lands on it.
function useHeldPayment(payment: PaymentRow | null, isHeld: boolean): PaymentRow | null {
    const lastRef = useRef<PaymentRow | null>(payment)
    if (payment) lastRef.current = payment
    return isHeld ? (payment ?? lastRef.current) : payment
}

// Posting a correction voids its original in the same transaction, and realtime can bring
// the void before the post's answer: while this form's own save corrects the original
// (the save store's `correcting`), the form keeps its place, so it moves on to the posted
// correction or shows a refusal. A void or correction by anyone else shows "cannot be
// edited".
function useCorrectionFormKept(
    state: PaymentScreenState,
    input: PaymentScreenInput
): PaymentScreenState {
    const original = input.id === null ? (input.replaces ?? '') : ''
    const isOwnSave = usePaymentSaveStore(s => original !== '' && s.correcting === original)
    return state === 'cannot-edit' && isOwnSave ? 'form' : state
}

/**
 * Every read of the receive-payment screen: access, settings, the deposit accounts, the
 * payment and its applications (at an id), the original of a correction (`?replaces`),
 * the customer, and the invoice `?invoice` names. Returns which surface to show and one
 * Retry over the failed reads (merged recoveries).
 */
export function usePaymentScreen(input: PaymentScreenInput) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const deposit = useDepositAccounts()
    const record = usePaymentRecord(input.id ?? '')
    const start = useStartInvoice(input.id === null ? (input.invoice ?? '') : '')
    const isHeld = usePaymentSaveStore(s => s.holding !== null && s.holding === input.id)
    const payment = useHeldPayment(record.payment, isHeld)
    // A saved correction is a draft that replaces a posted payment: its form reads the
    // original too (its applications widen the open balances).
    const isDraftForm = payment?.status === 'draft' || isHeld
    const draftReplaces = isDraftForm ? (payment?.replaces ?? '') : ''
    const original = usePaymentRecord(input.replaces ?? draftReplaces)
    const customerId = payment?.customer ?? original.payment?.customer ?? input.customer ?? ''
    const [customersCollection] = useStore('books_customers')
    const customer = useRecord(customersCollection, customerId)
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [] }
        : NO_RECOVERY
    const recovery = mergeRecoveries([
        accessRecovery,
        settings.recovery,
        deposit.recovery,
        record.recovery,
        original.recovery,
        start.recovery,
    ])
    const isError =
        access.isError ||
        settings.hasLoadError ||
        deposit.isError ||
        record.isError ||
        original.isError ||
        start.isError
    const isReady =
        access.isReady &&
        settings.isReady &&
        deposit.isReady &&
        record.isReady &&
        original.isReady &&
        start.isReady &&
        !(customerId !== '' && customer.isLoading)
    const computed = paymentScreenState({
        isReady,
        isError,
        canWrite: access.canWrite,
        isNew: input.id === null,
        status: payment?.status ?? null,
        isHeld,
        replacesStatus: input.replaces ? (original.payment?.status ?? null) : undefined,
        replacesReady: original.isReady,
        replacesError: original.isError,
    })
    const state = useCorrectionFormKept(computed, input)
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.payment', err),
        })
    }
    return {
        state,
        retry,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        depositAccounts: deposit.rows,
        payment,
        applications: record.applications,
        original: original.payment,
        originalApplications: original.applications,
        customerName: customer.record?.display_name ?? '',
        startInvoice: start.invoice,
    }
}

export type PaymentScreenData = ReturnType<typeof usePaymentScreen>
