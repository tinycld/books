import { planTableWrites } from '@tinycld/core/lib/forms/table-rows'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { router } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { useEffect, useRef, useState } from 'react'
import { moneyInputCents } from '../lib/money-input'
import { paymentRefusalHandler, type StoredApplication } from '../lib/payment-refusals'
import type { PaymentFormValues, PaymentWriteRow } from '../lib/payment-values'
import { paymentWriteRows } from '../lib/payment-values'
import { writeRefusalText } from '../lib/refusal'
import { tableWriteSteps } from '../lib/table-writes'
import { usePaymentSaveStore } from '../stores/payment-save-store'
import { useBackToEntries } from './useBackToEntries'
import type { PaymentFormState } from './usePaymentForm'

const LOG_CONTEXT = 'books.payment'

export type PaymentSaveMode = 'draft' | 'post' | 'post-new'

interface PaymentSaveInput {
    paymentForm: PaymentFormState
    currency: string
    // The saved draft's id; null for a new payment (new or a correction).
    paymentId: string | null
    // The draft's stored applications, live, in position order.
    storedApplications: readonly { id: string; invoice: string; amount: number }[]
    // The posted payment a new form corrects.
    replaces?: string
    // `?customer` of a new form: Post & new keeps it, and only it.
    openedWithCustomer?: string
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
    if (!row) throw new Error(`no payment application ${id} in the save`)
    return row
}

/**
 * The receive-payment form's saves (spec §3.6). Write order: (1) remove the stored
 * applications the form no longer holds, (2) insert or update the payment, (3) update and
 * insert the applications in list order (`position` from 0), (4) for Post, set
 * `status: 'posted'`. The save store holds the payment from before the mutation, so the
 * optimistic `posted` status does not swap the form for the read view. A refusal shows
 * on the form (paymentRefusalHandler); when a new payment's draft was written before the
 * refusal, the route moves to the draft, whose form shows it. After the user left, a
 * refusal is logged.
 */
export function usePaymentSave({
    paymentForm,
    currency,
    paymentId,
    storedApplications,
    replaces = '',
    openedWithCustomer = '',
    holdsHandOff,
}: PaymentSaveInput) {
    const [paymentsCollection, applicationsCollection] = useStore(
        'books_payments',
        'books_payment_applications'
    )
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
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
            const store = usePaymentSaveStore.getState()
            if (holdsHandOff && store.refused?.id === id) store.clearRefused()
        }
    }, [holdsHandOff, id])

    const save = useMutation({
        mutationFn: function* (input: SaveVariables) {
            const { values, rows } = input
            const before = storedApplications.map(row => ({
                id: row.id,
                invoice: row.invoice,
                amount: row.amount,
            }))
            const plan = planTableWrites(before, rows, [])
            const steps = tableWriteSteps(plan, {
                insert: write => {
                    const row = rowOf(rows, write.row.id)
                    return applicationsCollection.insert({
                        id: row.id,
                        payment: input.id,
                        invoice: row.invoice,
                        amount: row.amount,
                        position: write.position,
                    })
                },
                update: write => {
                    const row = rowOf(rows, write.row.id)
                    return applicationsCollection.update(row.id, draft => {
                        draft.amount = row.amount
                        draft.position = write.position
                    })
                },
                remove: rowId => applicationsCollection.delete(rowId),
            })
            const removes = steps.filter(step => step.itemNumber === null)
            const writes = steps.filter(step => step.itemNumber !== null)
            for (const step of removes) yield step.run()
            const header = {
                customer: values.customer,
                date: values.date,
                payment_method: values.payment_method,
                reference_no: values.reference_no,
                deposit_to: values.deposit_to,
                amount: moneyInputCents(values.amount, currency) ?? 0,
                memo: values.memo,
            }
            if (input.isNew) {
                yield paymentsCollection.insert({
                    id: input.id,
                    status: 'draft',
                    replaces,
                    ...header,
                })
            } else {
                yield paymentsCollection.update(input.id, draft => {
                    Object.assign(draft, header)
                })
            }
            input.progress.isHeaderWritten = true
            for (const step of writes) yield step.run()
            if (input.isPost) {
                yield paymentsCollection.update(input.id, draft => {
                    draft.status = 'posted'
                })
            }
        },
        // Each refusal is shown by the submit that awaited it (on the form, or logged once
        // the user left), so the default toast would repeat it.
        onError: () => {},
    })

    const remove = useMutation({
        mutationFn: function* (input: { id: string; applicationIds: string[] }) {
            if (input.applicationIds.length > 0) {
                yield input.applicationIds.map(rowId => applicationsCollection.delete(rowId))
            }
            yield paymentsCollection.delete(input.id)
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
            const customer = openedWithCustomer
                ? `&customer=${encodeURIComponent(openedWithCustomer)}`
                : ''
            router.replace(orgHref(`books/payments/new?fresh=${newRecordId()}${customer}`))
            return
        }
        // A saved or posted new payment moves to its own route; a draft's route already is.
        if (isNew) router.replace(orgHref(`books/payments/${id}`))
    }

    const submit = (mode: PaymentSaveMode) => async () => {
        if (isBusy.current) return
        isBusy.current = true
        left.current = false
        const submitted = copyValues(form.getValues())
        try {
            await form.handleSubmit(async () => {
                const order = outstanding.rows.map(row => row.id)
                const rows = paymentWriteRows(submitted, storedApplications, order)
                const stored: StoredApplication[] = rows.map((row, position) => ({
                    id: row.id,
                    invoice: row.invoice,
                    position,
                }))
                const progress = { isHeaderWritten: !isNew }
                const store = usePaymentSaveStore.getState()
                store.hold(id)
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
                    if (!isLive.current || left.current) {
                        log.warn(LOG_CONTEXT, writeRefusalText(error))
                    } else if (isNew && progress.isHeaderWritten) {
                        store.handOff({ id, values: submitted, error, stored })
                        router.replace(orgHref(`books/payments/${id}`))
                    } else {
                        paymentRefusalHandler(form, stored)(error)
                    }
                } finally {
                    usePaymentSaveStore.getState().release()
                }
            })()
        } finally {
            isBusy.current = false
        }
    }

    const confirmDelete = async () => {
        setDeleteError(null)
        usePaymentSaveStore.getState().hold(id)
        try {
            await remove.mutateAsync({
                id,
                applicationIds: storedApplications.map(row => row.id),
            })
            if (!left.current) leave()
        } catch (error) {
            if (isLive.current && !left.current) setDeleteError(writeRefusalText(error))
            else log.warn(LOG_CONTEXT, writeRefusalText(error))
        } finally {
            usePaymentSaveStore.getState().release()
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
