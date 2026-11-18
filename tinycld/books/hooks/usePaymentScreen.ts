import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useRef } from 'react'
import type { DepositAccountRow } from '../lib/deposit-accounts'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import type { PaymentFlow } from '../lib/payment-flow'
import { type PaymentScreenState, paymentScreenState } from '../lib/payment-screen-state'
import type { StartDocument } from '../lib/payment-start'
import { usePaymentSaveStore } from '../stores/payment-save-store'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import type { PaymentRecordHeader, PaymentRecordView } from './usePaymentRecord'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

type ReadState = { isReady: boolean; isError: boolean; recovery: LiveRecovery }

/**
 * A flow's own reads, which its screen passes as module-constant hooks; usePaymentScreen
 * calls each once per render in a fixed order (the accounts, the record at the id, the
 * start document, the original's record, the party's name), so no hook comes from the
 * flow's descriptor.
 */
export type PaymentScreenReads = {
    // The flow's record by id (an empty id reads nothing and is ready).
    useRecord: (id: string) => PaymentRecordView
    // The accounts the account field lists.
    useAccounts: () => ReadState & { rows: DepositAccountRow[] }
    // The document a new form ticks (`?invoice`, `?credit`); an empty id reads nothing.
    useStartDocument: (id: string) => ReadState & { document: StartDocument | null }
    // The party's display name; '' while it loads or with no party.
    usePartyName: (id: string) => { name: string; isLoading: boolean }
}

export type PaymentScreenInput = {
    // The payment's id; null at `<routeBase>/new`.
    id: string | null
    // `?replaces`: the posted payment a new form corrects.
    replaces?: string
    // The party (`?customer`) and the document to tick (`?invoice`) a new form starts with.
    party?: string
    document?: string
}

// While a post or delete holds the payment, the last row read stands in for an optimistic
// change (a delete removes the row before the server answers), so the form stays up and
// a refusal lands on it.
function useHeldPayment(
    payment: PaymentRecordHeader | null,
    isHeld: boolean
): PaymentRecordHeader | null {
    const lastRef = useRef<PaymentRecordHeader | null>(payment)
    if (payment) lastRef.current = payment
    return isHeld ? (payment ?? lastRef.current) : payment
}

// Posting a correction voids its original in the same transaction, and realtime can bring
// the void before the post's answer: while this form's own save corrects the original
// (the save store's `correcting` of the flow), the form keeps its place, so it moves on
// to the posted correction or shows a refusal. A void or correction by anyone else shows
// "cannot be edited".
function useCorrectionFormKept(
    flow: PaymentFlow,
    state: PaymentScreenState,
    input: PaymentScreenInput
): PaymentScreenState {
    const original = input.id === null ? (input.replaces ?? '') : ''
    const isOwnSave = usePaymentSaveStore(
        s => original !== '' && s.correcting[flow.key] === original
    )
    return state === 'cannot-edit' && isOwnSave ? 'form' : state
}

/**
 * Every read of a payment flow's screen: access, settings, and the flow's own reads
 * (`reads`): the accounts, the record and its lines (at an id), the original of a
 * correction (`?replaces`), the party's name, and the document a new form ticks. Returns
 * which surface to show and one Retry over the failed reads (merged recoveries). The save
 * store's hold and correction are the flow's.
 */
export function usePaymentScreen(
    flow: PaymentFlow,
    input: PaymentScreenInput,
    reads: PaymentScreenReads
) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const deposit = reads.useAccounts()
    const record = reads.useRecord(input.id ?? '')
    const start = reads.useStartDocument(input.id === null ? (input.document ?? '') : '')
    const isHeld = usePaymentSaveStore(
        s => s.holding[flow.key] !== null && s.holding[flow.key] === input.id
    )
    const payment = useHeldPayment(record.payment, isHeld)
    // A saved correction is a draft that replaces a posted payment: its form reads the
    // original too (its applications widen the open balances).
    const isDraftForm = payment?.status === 'draft' || isHeld
    const draftReplaces = isDraftForm ? (payment?.replaces ?? '') : ''
    const original = reads.useRecord(input.replaces ?? draftReplaces)
    const partyId = payment?.party ?? original.payment?.party ?? input.party ?? ''
    const party = reads.usePartyName(partyId)
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
        !(partyId !== '' && party.isLoading)
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
    const state = useCorrectionFormKept(flow, computed, input)
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error(flow.logContext, err),
        })
    }
    return {
        state,
        retry,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        depositAccounts: deposit.rows,
        payment,
        lines: record.lines,
        original: original.payment,
        originalLines: original.lines,
        partyName: party.name,
        startDocument: start.document,
    }
}

export type PaymentScreenData = ReturnType<typeof usePaymentScreen>
