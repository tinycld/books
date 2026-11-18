import { planTableWrites } from '@tinycld/core/lib/forms/table-rows'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { useEffect, useRef, useState } from 'react'
import { moneyInputCents } from '../lib/money-input'
import type { PaymentFlow } from '../lib/payment-flow'
import { paymentRefusalHandler, type StoredApplication } from '../lib/payment-refusals'
import type { PaymentFormValues, PaymentWriteRow } from '../lib/payment-values'
import { paymentWriteRows } from '../lib/payment-values'
import { writeRefusalText } from '../lib/refusal'
import { tableWriteSteps } from '../lib/table-writes'
import { usePaymentSaveStore } from '../stores/payment-save-store'
import { useBackToEntries } from './useBackToEntries'
import type { PaymentFormState } from './usePaymentForm'
import type { PaymentWrites } from './usePaymentWrites'

export type PaymentSaveMode = 'draft' | 'post' | 'post-new'

interface PaymentSaveInput {
    paymentForm: PaymentFormState
    currency: string
    // The saved draft's id; null for a new payment (new or a correction).
    paymentId: string | null
    // The draft's stored lines, live, in position order.
    storedLines: readonly { id: string; document: string; amount: number }[]
    // The posted payment a new form corrects.
    replaces?: string
    // The party a new form opened with (`?customer`, `?vendor`): Post & new keeps it, and
    // only it.
    openedWithParty?: string
    // This form started from a refusal a new payment's save handed off (the store's
    // `refused`); the hand-off is cleared when this form goes, so a later open of the
    // draft starts from the stored payment.
    holdsHandOff: boolean
}

type SaveVariables = {
    id: string
    isNew: boolean
    isPost: boolean
    values: PaymentFormValues
    rows: PaymentWriteRow[]
    // Set once the payment row is written: a refusal after it leaves a draft behind.
    progress: { isHeaderWritten: boolean }
}

// A copy of the form's values, so a later edit does not change the snapshot of a submit.
function copyValues(values: PaymentFormValues): PaymentFormValues {
    const payments = Object.fromEntries(
        Object.entries(values.payments).map(([id, entry]) => [id, { ...entry }])
    )
    return { ...values, payments }
}

function rowOf(rows: readonly PaymentWriteRow[], id: string): PaymentWriteRow {
    const row = rows.find(item => item.id === id)
    if (!row) throw new Error(`no payment line ${id} in the save`)
    return row
}

/**
 * A payment form's saves (receive-payment spec §3.6, vendor refund spec §3.6), through the
 * flow's writes. Write order: (1) remove the stored lines the form no longer holds,
 * (2) insert or update the header, (3) update and insert the lines in list order
 * (`position` from 0), (4) for Post, set `status: 'posted'`. The save store holds the
 * payment (under the flow's key) from before the mutation, so the optimistic `posted`
 * status does not swap the form for the read view. A refusal shows on the form
 * (paymentRefusalHandler, with the flow's keys); when a new payment's draft was written
 * before the refusal, the route moves to the draft, whose form shows it. After the user
 * left, a refusal is logged under the flow's log context.
 */
export function usePaymentSave(flow: PaymentFlow, writes: PaymentWrites, input: PaymentSaveInput) {
    const {
        paymentForm,
        currency,
        paymentId,
        storedLines,
        replaces = '',
        openedWithParty = '',
        holdsHandOff,
    } = input
    const orgHref = useOrgHref()
    const back = useBackToEntries()
    const { form, outstanding } = paymentForm
    // Read in render, so the form state follows it.
    const { isDirty } = form.formState
    const newIdRef = useRef(newRecordId())
    const isNew = paymentId === null
    const id = paymentId ?? newIdRef.current
    const isBusy = useRef(false)
    const isLive = useRef(true)
    const left = useRef(false)
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const flowKey = flow.key
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
            const store = usePaymentSaveStore.getState()
            if (holdsHandOff && store.refused[flowKey]?.id === id) store.clearRefused(flowKey)
        }
    }, [holdsHandOff, id, flowKey])
    // A correction's save that worked keeps `correcting` until this form goes, so the form
    // does not show "cannot be edited" (its original is void now) while it moves on.
    useEffect(() => {
        if (!replaces) return
        return () => usePaymentSaveStore.getState().stopCorrecting(flowKey, replaces)
    }, [replaces, flowKey])

    const save = useMutation({
        mutationFn: function* (variables: SaveVariables) {
            const { values, rows } = variables
            const before = storedLines.map(row => ({
                id: row.id,
                document: row.document,
                amount: row.amount,
            }))
            const plan = planTableWrites(before, rows, [])
            const steps = tableWriteSteps(plan, {
                insert: write => {
                    const row = rowOf(rows, write.row.id)
                    return writes.insertLine({
                        id: row.id,
                        header: variables.id,
                        document: row.document,
                        amount: row.amount,
                        position: write.position,
                    })
                },
                update: write => {
                    const row = rowOf(rows, write.row.id)
                    return writes.updateLine(row.id, {
                        amount: row.amount,
                        position: write.position,
                    })
                },
                remove: rowId => writes.deleteLine(rowId),
            })
            const removes = steps.filter(step => step.itemNumber === null)
            const lineWrites = steps.filter(step => step.itemNumber !== null)
            for (const step of removes) yield step.run()
            const header = {
                party: values.party,
                date: values.date,
                payment_method: values.payment_method,
                reference_no: values.reference_no,
                account: values.account,
                amount: moneyInputCents(values.amount, currency) ?? 0,
                memo: values.memo,
            }
            if (variables.isNew) {
                yield writes.insertHeader(variables.id, { ...header, replaces })
            } else {
                yield writes.updateHeader(variables.id, header)
            }
            variables.progress.isHeaderWritten = true
            for (const step of lineWrites) yield step.run()
            if (variables.isPost) yield writes.postHeader(variables.id)
        },
        // Each refusal is shown by the submit that awaited it (on the form, or logged once
        // the user left), so the default toast would repeat it.
        onError: () => {},
    })

    const remove = useMutation({
        mutationFn: function* (variables: { id: string; lineIds: string[] }) {
            if (variables.lineIds.length > 0) {
                yield variables.lineIds.map(rowId => writes.deleteLine(rowId))
            }
            yield writes.deleteHeader(variables.id)
        },
        // The Delete draft dialog shows the refusal (or it is logged once the user left).
        onError: () => {},
    })

    const leave = () => {
        left.current = true
        back.onBack()
    }

    const afterSave = (mode: PaymentSaveMode) => {
        if (mode === 'post-new') {
            const party = openedWithParty
                ? `&${flow.partyParam}=${encodeURIComponent(openedWithParty)}`
                : ''
            router.replace(orgHref(`${flow.routeBase}/new?fresh=${newRecordId()}${party}`))
            return
        }
        // A saved or posted new payment moves to its own route; a draft's route already is.
        if (isNew) router.replace(orgHref(`${flow.routeBase}/${id}`))
    }

    const submit = (mode: PaymentSaveMode) => async () => {
        if (isBusy.current) return
        isBusy.current = true
        left.current = false
        const submitted = copyValues(form.getValues())
        try {
            await form.handleSubmit(async () => {
                const order = outstanding.rows.map(row => row.id)
                const rows = paymentWriteRows(submitted, storedLines, order)
                const stored: StoredApplication[] = rows.map((row, position) => ({
                    id: row.id,
                    document: row.document,
                    position,
                }))
                const progress = { isHeaderWritten: !isNew }
                const store = usePaymentSaveStore.getState()
                const isCorrection = isNew && replaces !== ''
                if (isCorrection) store.startCorrecting(flowKey, replaces)
                store.hold(flowKey, id)
                try {
                    await save.mutateAsync({
                        id,
                        isNew,
                        isPost: mode !== 'draft',
                        values: submitted,
                        rows,
                        progress,
                    })
                    if (isLive.current && !left.current) {
                        form.reset(submitted)
                        afterSave(mode)
                    }
                } catch (error) {
                    if (isCorrection) store.stopCorrecting(flowKey, replaces)
                    if (!isLive.current || left.current) {
                        log.warn(flow.logContext, writeRefusalText(error))
                    } else if (isNew && progress.isHeaderWritten) {
                        store.handOff(flowKey, { id, values: submitted, error, stored })
                        router.replace(orgHref(`${flow.routeBase}/${id}`))
                    } else {
                        paymentRefusalHandler(form, stored, flow)(error)
                    }
                } finally {
                    usePaymentSaveStore.getState().release(flowKey)
                }
            })()
        } finally {
            isBusy.current = false
        }
    }

    const confirmDelete = async () => {
        setDeleteError(null)
        usePaymentSaveStore.getState().hold(flowKey, id)
        try {
            await remove.mutateAsync({
                id,
                lineIds: storedLines.map(row => row.id),
            })
            if (!left.current) leave()
        } catch (error) {
            if (isLive.current && !left.current) setDeleteError(writeRefusalText(error))
            else log.warn(flow.logContext, writeRefusalText(error))
        } finally {
            usePaymentSaveStore.getState().release(flowKey)
        }
    }

    return {
        isPending: save.isPending || remove.isPending,
        isDeletePending: remove.isPending,
        isDiscardOpen,
        isDeleteOpen,
        deleteError,
        saveDraft: submit('draft'),
        post: submit('post'),
        postAndNew: submit('post-new'),
        cancel: () => (isDirty ? setDiscardOpen(true) : leave()),
        keepEditing: () => setDiscardOpen(false),
        discard: () => {
            setDiscardOpen(false)
            leave()
        },
        openDeleteDraft: () => {
            setDeleteError(null)
            setDeleteOpen(true)
        },
        closeDeleteDraft: () => setDeleteOpen(false),
        confirmDelete,
        leave,
    }
}

export type PaymentSave = ReturnType<typeof usePaymentSave>
