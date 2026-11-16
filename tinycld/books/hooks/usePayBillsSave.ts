import { inArray, queryOnce } from '@tanstack/db'
import { log } from '@tinycld/core/lib/logger'
import { atomic, useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import {
    nextStartCheckNo,
    type PayBillsWritePlan,
    payBillsWritePlan,
    writeOrder,
} from '../lib/pay-bills-plan'
import { payBillsRefusalErrors } from '../lib/pay-bills-refusals'
import type { PayBillsRow } from '../lib/pay-bills-rows'
import { afterPayTarget, postedToastText } from '../lib/pay-bills-texts'
import type { PayBillsFormValues } from '../lib/pay-bills-values'
import { entryCents, type Payments } from '../lib/payment-allocation'
import { writeRefusalText } from '../lib/refusal'
import { usePayBillsStore } from '../stores/pay-bills-store'

const LOG_CONTEXT = 'books.billPayment'
const TOAST_MS = 4000

export type PayBillsSaveMode = 'pay' | 'pay-new'

export type PayBillsSaveInput = {
    form: UseFormReturn<PayBillsFormValues>
    // Every listed open bill (filtered or not) in the list's order: a Pay pays only these,
    // and each vendor's lines take their positions in this order.
    rows: readonly PayBillsRow[]
    currency: string
    // Pay & new: put focus back on Paid from once the form is reset.
    focusPaidFrom?: () => void
    // Pay & new: clear the screen's filters and sort.
    resetFilters?: () => void
    // Where Cancel and Discard go when there is no screen below to go back to (the
    // screen passes useBackToEntries' onBack, as the other Books forms leave).
    leaveFallback?: () => void
}

type PayVariables = { values: PayBillsFormValues; plan: PayBillsWritePlan }

// The payments of the listed rows only: a bill that left the list since (paid elsewhere,
// voided) is not paid, and its entry goes.
function listedPayments(payments: Payments, rows: readonly PayBillsRow[]): Payments {
    const listed = new Set(rows.map(row => row.id))
    return Object.fromEntries(Object.entries(payments).filter(([id]) => listed.has(id)))
}

function hasPayment(payments: Payments, currency: string): boolean {
    return Object.values(payments).some(entry => entryCents(entry, currency) > 0)
}

// "Posted 3 bill payments" with no numbers: the batch posted, but its numbers could not be
// read back.
function postedCountText(count: number): string {
    return count === 1 ? 'Posted 1 bill payment' : `Posted ${count} bill payments`
}

/**
 * Pay and Pay & new (spec §3.5, §9). The store holds the form from before the batch, so
 * nothing swaps the form while it runs. One batch: per vendor, in reverse display-name
 * order (`writeOrder`), the payment created posted, then its lines; the server posts each
 * payment inside the batch transaction. The batch answer holds the payments before their
 * post, so after it the collection reloads and the numbers are read by the plan's ids for
 * the toast. Pay then goes back (or, with nothing below, to the first payment's read
 * view); Pay & new keeps Paid from, date and method, moves Starting check no. past the
 * numbers used, clears the rows and the filters, and focuses Paid from. A refusal shows
 * under its row or field, or in the summary (payBillsRefusalErrors); after the user left
 * it is logged.
 */
export function usePayBillsSave({
    form,
    rows,
    currency,
    focusPaidFrom,
    resetFilters,
    leaveFallback,
}: PayBillsSaveInput) {
    const [paymentsCollection, linesCollection, billsCollection] = useStore(
        'books_bill_payments',
        'books_bill_payment_lines',
        'books_bills'
    )
    const orgHref = useOrgHref()
    const isBusy = useRef(false)
    const isLive = useRef(true)
    const left = useRef(false)
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
        }
    }, [])

    const save = useMutation({
        mutationFn: async ({ values, plan }: PayVariables) => {
            const method = values.payment_method
            if (method === '') throw new Error('a Pay needs a payment method')
            await atomic(() => {
                for (const vendor of writeOrder(plan)) {
                    paymentsCollection.insert({
                        id: vendor.paymentId,
                        status: 'posted',
                        vendor: vendor.vendor,
                        paid_from: values.paid_from,
                        date: values.date,
                        payment_method: method,
                        reference_no: vendor.reference_no,
                        // A new payment corrects none (a correction is checkpoint 3's).
                        replaces: '',
                    })
                    for (const line of vendor.lines) {
                        linesCollection.insert({
                            id: line.id,
                            payment: vendor.paymentId,
                            bill: line.bill,
                            amount: line.amount,
                            position: line.position,
                        })
                    }
                }
            })
        },
        // Each refusal is shown by the Pay that awaited it (on the form, or logged once
        // the user left), so the default toast would repeat it.
        onError: () => {},
    })

    // The posted numbers in display-name order; null when they cannot be read.
    const postedNumbers = async (plan: PayBillsWritePlan): Promise<string[] | null> => {
        const ids = plan.vendors.map(vendor => vendor.paymentId)
        try {
            await paymentsCollection.reload()
            const found = await queryOnce({
                query: q =>
                    q
                        .from({ payment: paymentsCollection })
                        .where(({ payment }) => inArray(payment.id, ids))
                        .select(({ payment }) => ({ id: payment.id, number: payment.number })),
            })
            const byId = new Map(found.map(row => [row.id, row.number]))
            const numbers = ids.map(id => byId.get(id) ?? '')
            return numbers.every(number => number !== '') ? numbers : null
        } catch (error) {
            log.error(LOG_CONTEXT, error)
            return null
        }
    }

    const toastPosted = async (plan: PayBillsWritePlan) => {
        const numbers = await postedNumbers(plan)
        const title =
            numbers === null ? postedCountText(plan.vendors.length) : postedToastText(numbers)
        useToastStore.getState().addToast({ title, variant: 'success', duration: TOAST_MS })
    }

    // The paid bills' new balances: the batch answer holds no bill, so until realtime lands
    // a Pay & new would still list a paid bill at its old open balance.
    const refreshBills = async () => {
        try {
            await billsCollection.reload()
        } catch (error) {
            log.error(LOG_CONTEXT, error)
        }
    }

    const leave = () => {
        left.current = true
        if (router.canGoBack()) router.back()
        else leaveFallback?.()
    }

    const afterPay = (plan: PayBillsWritePlan) => {
        const first = plan.vendors[0]?.paymentId ?? ''
        const target = afterPayTarget(router.canGoBack(), first)
        left.current = true
        if (target.kind === 'back') router.back()
        else router.replace(orgHref(target.href))
    }

    const startNext = (values: PayBillsFormValues, plan: PayBillsWritePlan) => {
        const used = values.payment_method === 'check' ? plan.vendors.length : 0
        form.reset({
            paid_from: values.paid_from,
            date: values.date,
            payment_method: values.payment_method,
            reference_no:
                used === 0 ? values.reference_no : nextStartCheckNo(values.reference_no, used),
            payments: {},
        })
        resetFilters?.()
        focusPaidFrom?.()
    }

    const showRefusal = (plan: PayBillsWritePlan, error: unknown) => {
        if (!isLive.current || left.current) {
            log.warn(LOG_CONTEXT, writeRefusalText(error))
            return
        }
        for (const refusal of payBillsRefusalErrors(plan, error)) {
            form.setError(refusal.field, { type: 'server', message: refusal.message })
        }
    }

    const submit = (mode: PayBillsSaveMode) => async () => {
        if (isBusy.current) return
        isBusy.current = true
        left.current = false
        const listed = listedPayments(form.getValues('payments'), rows)
        form.setValue('payments', listed)
        try {
            await form.handleSubmit(async values => {
                const plan = payBillsWritePlan({
                    rows,
                    payments: values.payments,
                    currency,
                    startCheckNo: values.reference_no,
                    method: values.payment_method,
                })
                usePayBillsStore.getState().hold()
                try {
                    try {
                        await save.mutateAsync({ values, plan })
                    } catch (error) {
                        showRefusal(plan, error)
                        return
                    }
                    await Promise.all([toastPosted(plan), refreshBills()])
                    if (!isLive.current || left.current) return
                    if (mode === 'pay-new') startNext(values, plan)
                    else afterPay(plan)
                } finally {
                    usePayBillsStore.getState().release()
                }
            })()
        } finally {
            isBusy.current = false
        }
    }

    const cancel = () => {
        const payments = listedPayments(form.getValues('payments'), rows)
        if (hasPayment(payments, currency)) setDiscardOpen(true)
        else leave()
    }

    return {
        pay: submit('pay'),
        payAndNew: submit('pay-new'),
        isPending: save.isPending,
        isDiscardOpen,
        cancel,
        keepEditing: () => setDiscardOpen(false),
        discard: () => {
            setDiscardOpen(false)
            leave()
        },
        leave,
    }
}

export type PayBillsSave = ReturnType<typeof usePayBillsSave>
