import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useEffect, useRef, useState } from 'react'
import type { PaymentFlow } from '../lib/payment-flow'
import { writeRefusalText } from '../lib/refusal'
import { usePaymentSaveStore } from '../stores/payment-save-store'
import type { PaymentWrites } from './usePaymentWrites'

interface PaymentDraftDeleteInput {
    // The saved draft's id.
    id: string
    // The draft's stored lines, which go before the header.
    lineIds: readonly string[]
    // The user left the screen: no move follows the delete, and a refusal is logged.
    hasLeft: () => boolean
    // Runs when the delete starts: a form clears its "left" mark here, as its save does
    // (a leave the guard held and the user then kept editing set it, yet the form stayed).
    onStart?: () => void
    // Where a delete that worked goes.
    onDeleted: () => void
}

/**
 * A saved payment draft's Delete draft (receive-payment spec §3.6, vendor refund spec
 * §3.6), through the flow's writes: its dialog's state, and the delete, which removes the
 * stored lines and then the header. The save store holds the draft for a delete while it
 * runs, so the optimistic removal does not swap the screen for "not found" and a refusal
 * lands in the dialog; after the user left, it is logged under the flow's log context.
 */
export function usePaymentDraftDelete(
    flow: PaymentFlow,
    writes: PaymentWrites,
    input: PaymentDraftDeleteInput
) {
    const { id, lineIds, hasLeft, onStart, onDeleted } = input
    const isLive = useRef(true)
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const flowKey = flow.key
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
        }
    }, [])

    const remove = useMutation({
        mutationFn: function* (variables: { id: string; lineIds: readonly string[] }) {
            if (variables.lineIds.length > 0) {
                yield variables.lineIds.map(rowId => writes.deleteLine(rowId))
            }
            yield writes.deleteHeader(variables.id)
        },
        // The Delete draft dialog shows the refusal (or it is logged once the user left).
        onError: () => {},
    })

    const confirmDelete = async () => {
        onStart?.()
        setDeleteError(null)
        usePaymentSaveStore.getState().hold(flowKey, { id, purpose: 'delete' })
        try {
            await remove.mutateAsync({ id, lineIds })
            if (!hasLeft()) onDeleted()
        } catch (error) {
            if (isLive.current && !hasLeft()) setDeleteError(writeRefusalText(error))
            else log.warn(flow.logContext, writeRefusalText(error))
        } finally {
            usePaymentSaveStore.getState().release(flowKey)
        }
    }

    return {
        isDeletePending: remove.isPending,
        // True from the update that ends `isDeletePending`: the delete's move is under way.
        isDeleteDone: remove.isSuccess,
        isDeleteOpen,
        deleteError,
        openDeleteDraft: () => {
            setDeleteError(null)
            setDeleteOpen(true)
        },
        closeDeleteDraft: () => setDeleteOpen(false),
        confirmDelete,
    }
}

export type PaymentDraftDelete = ReturnType<typeof usePaymentDraftDelete>
