import type { Transaction } from '@tanstack/react-db'
import { planTableWrites, type TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { router } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { useEffect, useRef, useState } from 'react'
import { adjustmentRefusalHandler } from '../lib/adjustment-refusals'
import { ADJUSTMENTS_PATH, adjustmentPath, newAdjustmentPath } from '../lib/adjustment-route'
import {
    type AdjustmentLineValues,
    type AdjustmentValues,
    dropBlankLines,
    isValueGiven,
    quantityOfText,
    valueCentsOfText,
    valueMode,
} from '../lib/adjustment-values'
import type { RecordRoute } from '../lib/record-route'
import { writeRefusalText } from '../lib/refusal'
import { tableWriteSteps } from '../lib/table-writes'
import { useAdjustmentSaveStore } from '../stores/adjustment-save-store'
import type { AdjustmentForm } from './useAdjustmentForm'
import { useAdjustmentDelete } from './useAdjustmentReadActions'
import { useFormLeaveGuard } from './useFormLeaveGuard'
import { useRecordNavigation } from './useRecordNavigation'

export type AdjustmentSaveMode = 'draft' | 'post' | 'post-new'

const LOG_CONTEXT = 'books.inventory-adjustment'

// A line row as the save writes it and as the plan compares it.
type LineRow = {
    id: string
    product: string
    bin: string
    quantity: number
    value: number
    // The Value change was typed: an increase at a typed 0 comes in at 0, not the last cost.
    value_given: boolean
    position: number
}

interface AdjustmentSaveInput {
    adjustmentForm: AdjustmentForm
    // The stored draft's id; null for a new adjustment.
    adjustmentId: string | null
    // The draft's stored lines, live, in position order.
    storedLines: readonly LineRow[]
    // This form started from a refusal a new adjustment's save handed off (the store's
    // `refused`); the hand-off is cleared when this form goes, so a later open of the draft
    // starts from the stored rows.
    holdsHandOff: boolean
    // The posted adjustment this form corrects ('' for none): `?replaces` of a new form, or
    // a stored correction draft's `replaces`. A correction posts only (spec §3.4). '' when
    // not given.
    replaces?: string
}

type SaveVariables = {
    id: string
    // The header is inserted (a new adjustment whose header no save wrote yet) or updated.
    insertsHeader: boolean
    // The posted adjustment the inserted header replaces ('' for none).
    replaces: string
    isPost: boolean
    values: AdjustmentValues
    rows: ReadonlyMap<string, LineRow>
    plan: TableWritePlan
    // Set as the writes go: the header is written; `lineAt` is the index in the saved
    // lines of the line whose write runs (null while another write runs), so a refusal of
    // that write shows under that line.
    progress: { isHeaderWritten: boolean; lineAt: number | null }
}

// Hundredths, as the server keeps them (server/stock.go qtyHundredths).
function roundQuantity(quantity: number): number {
    return Math.round(quantity * 100) / 100 + 0
}

/**
 * The rows the save writes from the parsed lines (blank lines dropped), at positions from 0
 * in list order. A line that changes no quantity names no bin (the server refuses a bin
 * on a value change); a decrease sends value 0 (the costing method values it). value_given
 * is true when the Value change text is not empty (isValueGiven), so the server tells a
 * typed 0.00 from an empty value, which takes the last cost.
 */
function lineRowsOf(lines: readonly AdjustmentLineValues[]): LineRow[] {
    return lines.map((line, position) => {
        const quantity = roundQuantity(quantityOfText(line.change)?.quantity ?? 0)
        const isAtCost = valueMode(quantity) === 'at-cost'
        return {
            id: line.id,
            product: line.product,
            bin: quantity === 0 ? '' : line.bin,
            quantity,
            value: isAtCost ? 0 : (valueCentsOfText(line.value) ?? 0),
            value_given: isValueGiven(line, isAtCost),
            position,
        }
    })
}

// One line write of the plan: the row it writes (null for a remove) and its transaction.
type LineWrite = { row: LineRow | null; run: () => Transaction<Record<string, unknown>> }

// The form's lines that the save would write (blank lines dropped) and no stored row holds.
function unstoredLineCount(
    lines: readonly AdjustmentLineValues[],
    storedLines: readonly LineRow[]
): number {
    const stored = new Set(storedLines.map(row => row.id))
    return dropBlankLines(lines).filter(line => !stored.has(line.id)).length
}

function copyValues(values: AdjustmentValues): AdjustmentValues {
    return { ...values, lines: values.lines.map(line => ({ ...line })) }
}

function useAdjustmentWrites() {
    const [adjustmentsCollection, linesCollection] = useStore(
        'books_inventory_adjustments',
        'books_inventory_adjustment_lines'
    )
    const lineFields = (row: LineRow) => ({
        product: row.product,
        bin: row.bin,
        quantity: row.quantity,
        value: row.value,
        value_given: row.value_given,
        position: row.position,
    })
    return {
        // A new adjustment is a manual draft; a correction names the adjustment it replaces
        // (set at create only; spec §4 "A correction inserts with `replaces`"). The server
        // gives the number at the post.
        insertHeader: (
            id: string,
            header: { date: string; account: string; memo: string },
            replaces: string
        ) =>
            adjustmentsCollection.insert({
                id,
                status: 'draft',
                kind: 'manual',
                replaces,
                ...header,
            }),
        updateHeader: (id: string, header: { date: string; account: string; memo: string }) =>
            adjustmentsCollection.update(id, draft => {
                Object.assign(draft, header)
            }),
        postHeader: (id: string) =>
            adjustmentsCollection.update(id, draft => {
                draft.status = 'posted'
            }),
        insertLine: (adjustment: string, row: LineRow) =>
            linesCollection.insert({ id: row.id, adjustment, ...lineFields(row) }),
        updateLine: (row: LineRow) =>
            linesCollection.update(row.id, draft => {
                Object.assign(draft, lineFields(row))
            }),
        deleteLine: (id: string) => linesCollection.delete(id),
    }
}

/**
 * An inventory adjustment form's saves (inventory-adjust spec §3.4, Do step 5). One
 * `useMutation` generator yields, in order: the header (insert as a manual draft, or
 * update), the lines' row plan (removes first, then by position, tableWriteSteps), and for
 * Post a separate status update; each its own transaction, so the insert and the status
 * update never merge. The save store holds the adjustment from before the mutation to
 * after it, so the optimistic `posted` status does not swap the form for the read view
 * and a refusal shows on the form (lib/adjustment-refusals.ts). When a new adjustment's
 * refused save wrote its header, the draft exists: the submitted values and the refusal go
 * to the store's hand-off and the route moves to the draft, whose form shows both (so
 * Discard never leaves a draft the user did not see). Save draft on `/new` replaces the
 * route with the draft's; Post on `/new` with the read view's; Post & new opens a blank
 * form (`?fresh=`). A correction (`replaces`) inserts its header with `replaces` and posts
 * only: Save draft and Post & new do nothing on it, and the store's `correcting` names
 * its original from before the mutation, so the screen keeps the form while the server's
 * post voids the original. A post that worked clears the store's `shownDraft` before the
 * hold ends, so the own post is not a stale draft. Delete draft deletes a saved draft
 * (useAdjustmentDelete) and opens the list. After the user left, a refusal is logged.
 */
export function useAdjustmentSave(input: AdjustmentSaveInput) {
    const { adjustmentForm, adjustmentId, storedLines, holdsHandOff, replaces = '' } = input
    const isCorrection = replaces !== ''
    const orgHref = useOrgHref()
    const { leave: leaveToList } = useRecordNavigation(ADJUSTMENTS_PATH)
    const { form } = adjustmentForm
    // A handed-off form starts from the submitted values, so react-hook-form counts none of
    // them as edits. A refusal at a line write left the lines after it unstored (the header
    // is written first, so it is stored): those lines are unsaved edits, and the leave asks.
    const hasUnstoredLines =
        holdsHandOff && unstoredLineCount(adjustmentForm.values.lines, storedLines) > 0
    const isDirty = form.formState.isDirty || hasUnstoredLines
    const writes = useAdjustmentWrites()
    const newIdRef = useRef(newRecordId())
    const isNew = adjustmentId === null
    const id = adjustmentId ?? newIdRef.current
    const isBusy = useRef(false)
    // `left` covers only a leave through Cancel or Discard. The leave guard is off while a
    // write runs (useFormLeaveGuard: isGuarding = isDirty && !isWriting), so the rail, the
    // back link or a browser Back can unmount the form mid-write; `isLive` stops that write's
    // late success from replacing the route the user went to, and logs its refusal.
    const isLive = useRef(true)
    const left = useRef(false)
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    // Set (in the store, synchronously) before the hand-off's move, so the leave guard lets
    // the move go.
    const isHandingOff = useAdjustmentSaveStore(state => isNew && state.refused?.id === id)
    // This draft was deleted (by its own Delete, or the list's beside it): the delete's move
    // to the list goes on, and its edits are not asked about.
    const isDeleted = useAdjustmentSaveStore(state => state.deleted === id)
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
            const store = useAdjustmentSaveStore.getState()
            if (holdsHandOff && store.refused?.id === id) store.clearRefused()
            store.clearDeleted(id)
        }
    }, [holdsHandOff, id])
    // A correction's post that worked keeps `correcting` until this form goes, so the form
    // does not show "cannot be edited" (its original is void now) while it moves on.
    useEffect(() => {
        if (!replaces) return
        return () => useAdjustmentSaveStore.getState().stopCorrecting(replaces)
    }, [replaces])

    const save = useMutation({
        mutationFn: function* (variables: SaveVariables) {
            const { values, progress } = variables
            const header = { date: values.date, account: values.account, memo: values.memo }
            if (variables.insertsHeader) {
                yield writes.insertHeader(variables.id, header, variables.replaces)
            } else {
                yield writes.updateHeader(variables.id, header)
            }
            progress.isHeaderWritten = true
            const rowOf = (rowId: string) => {
                const row = variables.rows.get(rowId)
                if (!row) throw new Error(`no inventory adjustment line ${rowId} in the save`)
                return row
            }
            const steps = tableWriteSteps<LineWrite>(variables.plan, {
                insert: write => {
                    const row = rowOf(write.row.id)
                    return { row, run: () => writes.insertLine(variables.id, row) }
                },
                update: write => {
                    const row = rowOf(write.row.id)
                    return { row, run: () => writes.updateLine(row) }
                },
                remove: rowId => ({ row: null, run: () => writes.deleteLine(rowId) }),
            })
            for (const step of steps) {
                const write = step.run()
                progress.lineAt = write.row === null ? null : write.row.position
                yield write.run()
            }
            progress.lineAt = null
            if (variables.isPost) yield writes.postHeader(variables.id)
        },
        // Each refusal is shown by the submit that awaited it (on the form, or logged once
        // the user left), so the default toast would repeat it.
        onError: () => {},
    })

    // `left`: the user asked to leave while a write runs, so the write neither moves nor
    // shows its refusal. Each write clears it when it starts.
    const leave = () => {
        left.current = true
        leaveToList()
    }

    const replaceWith = (route: RecordRoute) => router.replace(orgHref(route.path, route.params))
    const afterSave = (mode: AdjustmentSaveMode) => {
        if (mode === 'post-new') {
            replaceWith(newAdjustmentPath({ fresh: newRecordId() }))
            return
        }
        // A saved or posted new adjustment moves to its own route; a draft's route already is.
        if (isNew) replaceWith(adjustmentPath(id))
    }
    // A write that worked, while the save store still holds the adjustment.
    const afterWrite = (mode: AdjustmentSaveMode, submitted: AdjustmentValues) => {
        // The own post is no change by someone else: the draft's form stops being a shown
        // draft before the hold ends (useStaleDraft).
        if (mode !== 'draft') useAdjustmentSaveStore.getState().hideDraft(id)
        if (!isLive.current || left.current) return
        form.reset(submitted)
        afterSave(mode)
    }

    const submit = (mode: AdjustmentSaveMode) => async () => {
        // A correction posts only, as the deposit's: no draft of it is saved and no Post &
        // new follows it (spec §3.4; its bar and keys offer neither).
        if (isCorrection && mode !== 'post') return
        if (isBusy.current) return
        isBusy.current = true
        left.current = false
        const submitted = copyValues(form.getValues())
        try {
            await form.handleSubmit(async parsed => {
                // A new form has written nothing: a save that wrote its header hands off to
                // the draft's route, refused or not.
                const before = isNew ? [] : storedLines
                const after = lineRowsOf(parsed.lines)
                const progress: SaveVariables['progress'] = {
                    isHeaderWritten: !isNew,
                    lineAt: null,
                }
                const store = useAdjustmentSaveStore.getState()
                // A correction's post voids its original in the same server transaction:
                // the screen keeps this form over "cannot be edited" while it runs.
                if (isCorrection) store.startCorrecting(replaces)
                store.hold({ id, purpose: 'save' })
                try {
                    await save.mutateAsync({
                        id,
                        insertsHeader: isNew,
                        replaces,
                        isPost: mode !== 'draft',
                        values: parsed,
                        rows: new Map(after.map(row => [row.id, row])),
                        plan: planTableWrites(before, after, []),
                        progress,
                    })
                    afterWrite(mode, submitted)
                } catch (error) {
                    if (isCorrection) store.stopCorrecting(replaces)
                    const { lineAt } = progress
                    if (!isLive.current || left.current) {
                        log.warn(LOG_CONTEXT, writeRefusalText(error))
                    } else if (isNew && progress.isHeaderWritten) {
                        store.handOff({
                            id,
                            values: submitted,
                            error,
                            saved: parsed.lines,
                            ...(lineAt === null ? {} : { lineAt }),
                        })
                        replaceWith(adjustmentPath(id))
                    } else {
                        adjustmentRefusalHandler(form, {
                            saved: parsed.lines,
                            formLines: form.getValues('lines'),
                            lineAt,
                        })(error)
                    }
                } finally {
                    useAdjustmentSaveStore.getState().release()
                }
            })()
        } finally {
            isBusy.current = false
        }
    }

    const ask = () => setDiscardOpen(true)

    // Delete draft (⌘⌫): one delete of the saved draft, held by the save store so the form
    // stays until the server answers; then the list.
    const draftDelete = useAdjustmentDelete({
        holds: () => true,
        onDeleted: () => {
            if (isLive.current && !left.current) leaveToList()
        },
        hasLeft: () => !isLive.current || left.current,
    })
    const openDeleteDraft = () => {
        if (isNew) return
        left.current = false
        draftDelete.open({ id, number: '' })
    }

    return {
        isPending: save.isPending || draftDelete.isPending,
        // A refused save handed off to the draft, or the draft was deleted: its move is
        // under way.
        isLeaving: isHandingOff || draftDelete.isDone || isDeleted,
        isDirty,
        isDiscardOpen,
        isCorrection,
        openDeleteDraft,
        isDeleteOpen: draftDelete.isOpen,
        deleteDialog: draftDelete.dialog,
        saveDraft: submit('draft'),
        post: submit('post'),
        postAndNew: submit('post-new'),
        cancel: () => (isDirty ? ask() : leave()),
        keepEditing: () => setDiscardOpen(false),
        discard: () => {
            setDiscardOpen(false)
            leave()
        },
        leave,
    }
}

export type AdjustmentSave = ReturnType<typeof useAdjustmentSave>

/**
 * The adjustment form's leave guard (useFormLeaveGuard) over its save: Cancel (Esc), the
 * back link and every way out ask before a dirty form is left, with the form's one Discard
 * dialog. While the guard is on, Cancel only leaves, and the guard asks.
 */
export function useAdjustmentLeaveGuard(save: AdjustmentSave) {
    return useFormLeaveGuard({
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
}

export type AdjustmentLeaveGuard = ReturnType<typeof useAdjustmentLeaveGuard>
