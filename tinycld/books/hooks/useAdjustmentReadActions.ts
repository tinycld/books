import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { formatHint } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useState } from 'react'
import { adjustmentReadActions } from '../lib/adjustment-actions'
import { ADJUSTMENTS_PATH } from '../lib/adjustment-route'
import {
    ADJUSTMENT_READ_DESCRIPTIONS,
    ADJUSTMENT_READ_KEYS,
    type AdjustmentReadKeyAction,
    adjustmentReadKeysOffered,
} from '../lib/adjustment-shortcuts'
import { documentNewHref } from '../lib/document-routes'
import { writeRefusalText } from '../lib/refusal'
import { useAdjustmentSaveStore } from '../stores/adjustment-save-store'
import type { AdjustmentRecordHeader } from './useAdjustmentRecord'
import { useBooksAccess } from './useBooksAccess'
import type { DocumentReadItem } from './useDocumentReadActions'
import { useOpenFromReadView } from './useOpenFromReadView'

const LOG_CONTEXT = 'books.inventory-adjustment'
const ADJUSTMENT_ROUTES = { routeBase: ADJUSTMENTS_PATH }
const READ_ORDER: readonly AdjustmentReadKeyAction[] = ['edit', 'void', 'copy']

// The adjustment a Void or Delete dialog asks about.
export type AdjustmentTarget = { id: string; number: string }

/**
 * The Void of an inventory adjustment (spec §3.4, §4 "Void: one update"): the confirm's
 * state and ONE `useMutation` update of `status` to `void` (the server takes the stock
 * change back and voids the entry). A refusal is logged and shown where the caller shows
 * it: `notice` (the read view) closes the dialog and keeps the text in `refusal` until the
 * next Void; `dialog` (the list) keeps the dialog open with the text in it. The confirm
 * waits while writes are unavailable.
 */
export function useAdjustmentVoid(refusalIn: 'notice' | 'dialog') {
    const [adjustmentsCollection] = useStore('books_inventory_adjustments')
    const writesAvailable = useWritesAvailable().available
    const [target, setTarget] = useState<AdjustmentTarget | null>(null)
    const [refusal, setRefusal] = useState<string | null>(null)
    const mutation = useMutation({
        mutationFn: function* (id: string) {
            yield adjustmentsCollection.update(id, draft => {
                draft.status = 'void'
            })
        },
        onSuccess: () => setTarget(null),
        // The notice or the dialog shows the refusal, so the default toast would repeat it.
        onError: error => {
            const text = writeRefusalText(error)
            log.warn(LOG_CONTEXT, text)
            setRefusal(text)
            if (refusalIn === 'notice') setTarget(null)
        },
    })
    const open = (next: AdjustmentTarget) => {
        mutation.reset()
        setRefusal(null)
        setTarget(next)
    }
    const confirm = () => {
        if (target) mutation.mutate(target.id)
    }
    const close = () => setTarget(null)
    return {
        open,
        isPending: mutation.isPending,
        // The read view's notice of the last refusal; null while none shows.
        refusal: refusalIn === 'notice' ? refusal : null,
        dialog: {
            isVisible: target !== null,
            number: target?.number ?? '',
            isPending: mutation.isPending,
            isConfirmDisabled: !writesAvailable,
            errorMessage: refusalIn === 'dialog' ? refusal : null,
            onConfirm: confirm,
            onCancel: close,
        },
    }
}

export type AdjustmentVoidDialogState = ReturnType<typeof useAdjustmentVoid>['dialog']

interface AdjustmentDeleteInput {
    // The save store holds the draft while the delete runs, so the open form does not swap
    // for "not found" before the server answers: true for the form's delete, and for the
    // list's delete of the draft open beside the list.
    holds: (id: string) => boolean
    // After the delete worked; the dialog has closed.
    onDeleted?: (id: string) => void
    // The refusal is not shown (the user left): it is logged only.
    hasLeft?: () => boolean
}

/**
 * Delete draft (spec §3.4, §4 "Delete draft: one delete (the lines cascade)"): the confirm's
 * state and ONE `useMutation` delete of the draft's row; the server deletes its lines. A
 * delete that worked clears the save store's `shownDraft` of the draft before the hold
 * ends, so its open form never reads the own delete as a change by someone else, and sets
 * the store's `deleted` before `onDeleted` moves, so that form's leave guard lets the
 * move go (useAdjustmentSave `isLeaving`). A
 * refusal stays in the dialog (or is logged once the user left). The confirm waits while
 * writes are unavailable.
 */
export function useAdjustmentDelete({ holds, onDeleted, hasLeft }: AdjustmentDeleteInput) {
    const [adjustmentsCollection] = useStore('books_inventory_adjustments')
    const writesAvailable = useWritesAvailable().available
    const [target, setTarget] = useState<AdjustmentTarget | null>(null)
    const [refusal, setRefusal] = useState<string | null>(null)
    const mutation = useMutation({
        mutationFn: function* (id: string) {
            yield adjustmentsCollection.delete(id)
        },
        // The dialog shows the refusal, so the default toast would repeat it.
        onError: () => {},
    })
    const confirm = async () => {
        if (!target) return
        const { id } = target
        setRefusal(null)
        const isHolding = holds(id)
        if (isHolding) useAdjustmentSaveStore.getState().hold({ id, purpose: 'delete' })
        try {
            await mutation.mutateAsync(id)
            const store = useAdjustmentSaveStore.getState()
            store.hideDraft(id)
            // Before the move: the deleted draft's open form lets it go with no Discard.
            store.markDeleted(id)
            setTarget(null)
            onDeleted?.(id)
        } catch (error) {
            const text = writeRefusalText(error)
            log.warn(LOG_CONTEXT, text)
            if (!hasLeft?.()) setRefusal(text)
        } finally {
            if (isHolding) useAdjustmentSaveStore.getState().release()
        }
    }
    const open = (next: AdjustmentTarget) => {
        setRefusal(null)
        setTarget(next)
    }
    return {
        open,
        isPending: mutation.isPending,
        // True from the update that ends `isPending`: the delete's move is under way.
        isDone: mutation.isSuccess,
        isOpen: target !== null,
        dialog: {
            isVisible: target !== null,
            isPending: mutation.isPending,
            isConfirmDisabled: !writesAvailable,
            errorMessage: refusal,
            onConfirm: () => void confirm(),
            onCancel: () => setTarget(null),
        },
    }
}

export type AdjustmentDeleteDialogState = ReturnType<typeof useAdjustmentDelete>['dialog']

export type AdjustmentReadRecord = Pick<
    AdjustmentRecordHeader,
    'id' | 'status' | 'kind' | 'number' | 'replaced_by'
>

/**
 * The read view's actions (spec §3.4, §3.5) as rows of the shared DocumentReadActions:
 * Edit (E), Void (V) and Copy (C) as `adjustmentReadActions` offers them. Edit replaces the
 * read view with the correction (`…/new?replaces=<id>`) and Copy with a new form from this
 * adjustment (`…/new?copy=<id>`), both by useOpenFromReadView; Void opens its confirm
 * (useAdjustmentVoid, refusal in the read view's notice). A disabled action (writes are
 * unavailable) and every action while the void runs wait; a key acts only while its action
 * is offered (`adjustmentReadKeysOffered`).
 */
export function useAdjustmentReadActions(record: AdjustmentReadRecord) {
    const { canWrite } = useBooksAccess()
    const writesAvailable = useWritesAvailable().available
    const openFromReadView = useOpenFromReadView(record.id)
    const voiding = useAdjustmentVoid('notice')
    const offers = adjustmentReadActions({
        status: record.status,
        kind: record.kind,
        replacedBy: record.replaced_by,
        canWrite,
        writesAvailable,
    })
    const keyed = adjustmentReadKeysOffered(offers, true)
    const run: Record<AdjustmentReadKeyAction, () => void> = {
        edit: () => openFromReadView(documentNewHref(ADJUSTMENT_ROUTES, { replaces: record.id })),
        void: () => voiding.open({ id: record.id, number: record.number }),
        copy: () => openFromReadView(documentNewHref(ADJUSTMENT_ROUTES, { copy: record.id })),
    }
    const shown = READ_ORDER.filter(action => offers[action] !== 'hidden')
    const items: DocumentReadItem[] = shown.map(action => ({
        action,
        id: `read-${action}`,
        label: ADJUSTMENT_READ_DESCRIPTIONS[action],
        keys: formatHint(ADJUSTMENT_READ_KEYS[action]).text,
        isDisabled: !keyed.includes(action) || voiding.isPending,
        isDestructive: action === 'void',
        onSelect: run[action],
    }))
    // The confirm closes when Void stops being offered (the adjustment was voided or
    // corrected elsewhere while it was open), unless this dialog's own void runs.
    const isVoidShown = offers.void !== 'hidden' || voiding.isPending
    const voidDialog = { ...voiding.dialog, isVisible: voiding.dialog.isVisible && isVoidShown }
    return {
        items,
        isBusy: voiding.isPending,
        voidDialog,
        refusal: voiding.refusal,
    }
}

export type AdjustmentReadActionsState = ReturnType<typeof useAdjustmentReadActions>
