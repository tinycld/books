import { planTableWrites, type TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import { useEffect, useRef, useState } from 'react'
import { depositRefusalHandler } from '../lib/deposit-refusals'
import type { DepositFormValues } from '../lib/deposit-values'
import { moneyInputCents } from '../lib/money-input'
import { writeRefusalText } from '../lib/refusal'
import { tableWriteSteps } from '../lib/table-writes'
import { type DepositStoredItem, useDepositSaveStore } from '../stores/deposit-save-store'
import { useBackToJournalEntries } from './useBackToJournalEntries'
import type { DepositForm } from './useDepositForm'
import type { DepositWrites } from './useDepositWrites'
import { useFormLeaveGuard } from './useFormLeaveGuard'

export type DepositSaveMode = 'draft' | 'post' | 'post-new'

const LOG_CONTEXT = 'books.deposit'
const ROUTE_BASE = 'books/deposits'

interface DepositSaveInput {
    depositForm: DepositForm
    currency: string
    // The saved draft's id; null for a new deposit.
    depositId: string | null
    // The draft's stored item and line rows, live, in position order.
    storedItems: readonly { id: string; line: string; position: number }[]
    storedLines: readonly {
        id: string
        customer: string
        vendor: string
        account: string
        description: string
        amount: number
        position: number
    }[]
    // The posted deposit a new form corrects ('' for none).
    replaces?: string
    // This form started from a refusal a new deposit's save handed off (the store's
    // `refused`); the hand-off is cleared when this form goes, so a later open of the draft
    // starts from the stored deposit.
    holdsHandOff: boolean
}

type SaveVariables = {
    id: string
    isNew: boolean
    isPost: boolean
    values: DepositFormValues
    itemPlan: TableWritePlan
    linePlan: TableWritePlan
    // Set once the header row is written: a refusal after it leaves a draft behind.
    // `lineAt` is the form index of the other funds line whose write runs (null while any
    // other write runs), so a refusal of that write shows under that line.
    progress: { isHeaderWritten: boolean; lineAt: number | null }
}

function copyValues(values: DepositFormValues): DepositFormValues {
    return {
        ...values,
        items: values.items.map(item => ({ ...item })),
        lines: values.lines.map(line => ({ ...line })),
    }
}

/**
 * The items' plan, keyed by line id (spec §3.6): a ticked line the draft stores is kept
 * and not rewritten (the server refuses an item update), a stored line no longer ticked is
 * removed, and a new tick is inserted after the highest stored position, in tick order. So
 * the server's rank of each row (`items.<n>`) is its index in the form's `items`, and
 * `stored` is every row of the save by its position, for itemLineOfRefusal.
 */
function itemPlanOf(
    storedItems: DepositSaveInput['storedItems'],
    ticked: readonly { line: string }[]
): { plan: TableWritePlan; stored: DepositStoredItem[] } {
    const byLine = new Map(storedItems.map(item => [item.line, item]))
    const before = storedItems.map(item => ({ id: item.line }))
    const after = ticked.map(item => ({ id: item.line }))
    const planned = planTableWrites(before, after, [])
    const top = storedItems.reduce((max, item) => Math.max(max, item.position), -1)
    const insert = planned.insert.map((write, rank) => ({
        row: write.row,
        position: top + 1 + rank,
    }))
    const remove = planned.remove.flatMap(line => byLine.get(line)?.id ?? [])
    const kept = after.flatMap(row => {
        const item = byLine.get(row.id)
        return item ? [{ line: item.line, position: item.position }] : []
    })
    const added = insert.map(write => ({ line: write.row.id, position: write.position }))
    return { plan: { insert, update: [], remove }, stored: [...kept, ...added] }
}

/**
 * The lines' plan, by row id (lib/deposit-values.ts `DepositLineValues.id`): a form line
 * whose id a stored line has is updated when a cell or its place changed, a form line with
 * a new id is inserted, and a stored line the form no longer holds is removed. Positions
 * run from 0 in list order; the stored `position` is a cell too, so a kept line whose
 * stored position is not its index (a gap) is rewritten and the order reads back as shown.
 */
function linePlanOf(
    storedLines: DepositSaveInput['storedLines'],
    values: DepositFormValues,
    currency: string
): TableWritePlan {
    const after = values.lines.map((line, index) => ({
        ...line,
        amount: moneyInputCents(line.amount, currency) ?? 0,
        position: index,
    }))
    const before = storedLines.map(line => ({
        id: line.id,
        customer: line.customer,
        vendor: line.vendor,
        account: line.account,
        description: line.description,
        amount: line.amount,
        position: line.position,
    }))
    return planTableWrites(before, after, [])
}

/**
 * A deposit form's saves (bank deposit spec §3.6, §3.7). One `useMutation` generator
 * yields, in order: the header (insert as a draft or update), the items' and lines' row
 * plans (removes first, then by position, tableWriteSteps), and for Post the status
 * update; each a separate transaction, so the insert and the status update never merge.
 * The save store holds the deposit from before the mutation, so the optimistic `posted`
 * status does not swap the form for the read view. A refusal shows on the form
 * (depositRefusalHandler); when a new deposit's draft was written before the refusal, the
 * route moves to the draft, whose form shows it. After the user left, a refusal is logged.
 */
export function useDepositSave(writes: DepositWrites, input: DepositSaveInput) {
    const { depositForm, currency, depositId, storedItems, storedLines, holdsHandOff } = input
    const replaces = input.replaces ?? ''
    const orgHref = useOrgHref()
    const backToEntries = useBackToJournalEntries()
    const { form } = depositForm
    const { isDirty } = form.formState
    const newIdRef = useRef(newRecordId())
    const isNew = depositId === null
    const id = depositId ?? newIdRef.current
    const isBusy = useRef(false)
    const isLive = useRef(true)
    const left = useRef(false)
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    // What Discard does: leave (Cancel, Back), or open a Transaction link.
    const afterDiscard = useRef<() => void>(() => {})
    const isHandingOff = useDepositSaveStore(state => isNew && state.refused?.id === id)
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
            const store = useDepositSaveStore.getState()
            if (holdsHandOff && store.refused?.id === id) store.clearRefused()
        }
    }, [holdsHandOff, id])
    // A correction's save that worked keeps `correcting` until this form goes, so the form
    // does not show "cannot be edited" (its original is void now) while it moves on.
    useEffect(() => {
        if (!replaces) return
        return () => useDepositSaveStore.getState().stopCorrecting(replaces)
    }, [replaces])

    const save = useMutation({
        mutationFn: function* (variables: SaveVariables) {
            const { values } = variables
            const header = { deposit_to: values.deposit_to, date: values.date, memo: values.memo }
            if (variables.isNew) {
                yield writes.insertHeader(variables.id, header, replaces)
            } else {
                yield writes.updateHeader(variables.id, header)
            }
            variables.progress.isHeaderWritten = true
            const itemSteps = tableWriteSteps(variables.itemPlan, {
                insert: write =>
                    writes.insertItem({
                        id: newRecordId(),
                        deposit: variables.id,
                        line: write.row.id,
                        position: write.position,
                    }),
                update: () => {
                    throw new Error('a deposit item is never updated')
                },
                remove: itemId => writes.deleteItem(itemId),
            })
            const lineIndex = new Map(values.lines.map((line, index) => [line.id, index]))
            const lineOf = (write: { row: { id: string }; position: number }) => {
                const line = values.lines[lineIndex.get(write.row.id) ?? -1]
                if (line === undefined)
                    throw new Error(`no deposit line ${write.row.id} in the save`)
                return {
                    customer: line.customer,
                    vendor: line.vendor,
                    account: line.account,
                    description: line.description,
                    amount: moneyInputCents(line.amount, currency) ?? 0,
                    position: write.position,
                }
            }
            const lineSteps = tableWriteSteps(variables.linePlan, {
                insert: write =>
                    writes.insertLine({
                        id: write.row.id,
                        deposit: variables.id,
                        ...lineOf(write),
                    }),
                update: write => writes.updateLine(write.row.id, lineOf(write)),
                remove: lineId => writes.deleteLine(lineId),
            })
            const steps = [
                ...itemSteps.map(step => ({ run: step.run, lineAt: null })),
                ...lineSteps.map(step => ({
                    run: step.run,
                    lineAt: step.itemNumber === null ? null : (lineIndex.get(step.rowId) ?? null),
                })),
            ]
            for (const step of steps) {
                variables.progress.lineAt = step.lineAt
                yield step.run()
            }
            variables.progress.lineAt = null
            if (variables.isPost) yield writes.postHeader(variables.id)
        },
        // Each refusal is shown by the submit that awaited it (on the form, or logged once
        // the user left), so the default toast would repeat it.
        onError: () => {},
    })

    // `left`: the user asked to leave while a write runs, so the write neither moves nor
    // shows its refusal. Each write clears it when it starts. Cancel of a correction goes
    // back to the read view of the deposit it edits (Edit replaced that read view); any
    // other Cancel, and the back link, go to Journal Entries.
    const leaveTo = (go: () => void) => () => {
        left.current = true
        go()
    }
    const toOriginal = () => router.replace(orgHref(`${ROUTE_BASE}/${replaces}`))
    const leave = leaveTo(replaces ? toOriginal : backToEntries)
    const leaveToEntries = leaveTo(backToEntries)

    const draftDelete = useDepositDraftDelete(writes, {
        id,
        itemIds: storedItems.map(item => item.id),
        lineIds: storedLines.map(line => line.id),
        hasLeft: () => left.current,
        onStart: () => {
            left.current = false
        },
        onDeleted: leaveToEntries,
    })

    const afterSave = (mode: DepositSaveMode) => {
        if (mode === 'post-new') {
            router.replace(orgHref(`${ROUTE_BASE}/new?fresh=${newRecordId()}`))
            return
        }
        // A saved or posted new deposit moves to its own route; a draft's route already is.
        if (isNew) router.replace(orgHref(`${ROUTE_BASE}/${id}`))
    }

    const submit = (mode: DepositSaveMode) => async () => {
        if (isBusy.current) return
        isBusy.current = true
        left.current = false
        const submitted = copyValues(form.getValues())
        try {
            await form.handleSubmit(async () => {
                const items = itemPlanOf(storedItems, submitted.items)
                const lines = linePlanOf(storedLines, submitted, currency)
                const progress: SaveVariables['progress'] = {
                    isHeaderWritten: !isNew,
                    lineAt: null,
                }
                const store = useDepositSaveStore.getState()
                // A correction's post voids its original: the screen keeps this form over
                // "cannot be edited" while the save runs (useDepositScreen).
                const isCorrection = isNew && replaces !== ''
                if (isCorrection) store.startCorrecting(replaces)
                store.hold({ id, purpose: 'save' })
                try {
                    await save.mutateAsync({
                        id,
                        isNew,
                        isPost: mode !== 'draft',
                        values: submitted,
                        itemPlan: items.plan,
                        linePlan: lines,
                        progress,
                    })
                    if (isLive.current && !left.current) {
                        form.reset(submitted)
                        afterSave(mode)
                    }
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
                            stored: items.stored,
                            ...(lineAt === null ? {} : { lineAt }),
                        })
                        router.replace(orgHref(`${ROUTE_BASE}/${id}`))
                    } else {
                        depositRefusalHandler(form, items.stored, submitted.items, lineAt)(error)
                    }
                } finally {
                    useDepositSaveStore.getState().release()
                }
            })()
        } finally {
            isBusy.current = false
        }
    }

    const ask = (then: () => void) => {
        afterDiscard.current = then
        setDiscardOpen(true)
    }

    // A Transaction link pushes the item's document over the form, which a push does not
    // remove, so the leave guard would not ask: a dirty form asks here, and Discard drops
    // the edits before the push.
    const openLink = (href: string) => {
        const open = () => router.push(orgHref(href))
        if (!isDirty) {
            open()
            return
        }
        ask(() => {
            form.reset()
            open()
        })
    }

    return {
        ...draftDelete,
        isPending: save.isPending || draftDelete.isDeletePending,
        // A write that leaves the form succeeded or handed off: its move is under way.
        isLeaving: draftDelete.isDeleteDone || isHandingOff,
        isDirty,
        isDiscardOpen,
        saveDraft: submit('draft'),
        post: submit('post'),
        postAndNew: submit('post-new'),
        cancel: () => (isDirty ? ask(leave) : leave()),
        back: () => (isDirty ? ask(leaveToEntries) : leaveToEntries()),
        openLink,
        keepEditing: () => setDiscardOpen(false),
        discard: () => {
            setDiscardOpen(false)
            afterDiscard.current()
        },
        leave,
        leaveToEntries,
    }
}

export type DepositSave = ReturnType<typeof useDepositSave>

/**
 * The deposit form's leave guard (useFormLeaveGuard) over its save: Cancel, the header
 * back link and every way out ask before a dirty form is left, with the form's one
 * Discard dialog. `back` is the header back link's move (Journal Entries); for a
 * correction it differs from Cancel's (the original's read view). Like Cancel, while the
 * guard is on it only leaves, and the guard asks.
 */
export function useDepositLeaveGuard(save: DepositSave) {
    const isWriting = save.isPending || save.isLeaving
    const guard = useFormLeaveGuard({
        isDirty: save.isDirty,
        isWriting,
        cancel: save.cancel,
        leave: save.leave,
        question: {
            isOpen: save.isDiscardOpen,
            discard: save.discard,
            keepEditing: save.keepEditing,
        },
    })
    const isGuarding = save.isDirty && !isWriting
    return { ...guard, back: isGuarding ? save.leaveToEntries : save.back }
}

export type DepositLeaveGuard = ReturnType<typeof useDepositLeaveGuard>

interface DepositDraftDeleteInput {
    id: string
    // The draft's stored rows, which go before the header.
    itemIds: readonly string[]
    lineIds: readonly string[]
    // The user left the screen: no move follows the delete, and a refusal is logged.
    hasLeft: () => boolean
    onStart: () => void
    onDeleted: () => void
}

/**
 * A saved draft's Delete draft (spec §3.6): its dialog's state, and the delete, which
 * removes the stored items and lines and then the header. The save store holds the draft
 * for a delete while it runs, so the optimistic removal does not swap the form for "not
 * found" and a refusal lands in the dialog; after the user left, it is logged.
 */
function useDepositDraftDelete(writes: DepositWrites, input: DepositDraftDeleteInput) {
    const { id, itemIds, lineIds, hasLeft, onStart, onDeleted } = input
    const isLive = useRef(true)
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    useEffect(() => {
        isLive.current = true
        return () => {
            isLive.current = false
        }
    }, [])

    const remove = useMutation({
        mutationFn: function* (variables: {
            id: string
            itemIds: readonly string[]
            lineIds: readonly string[]
        }) {
            const rows = [
                ...variables.itemIds.map(rowId => writes.deleteItem(rowId)),
                ...variables.lineIds.map(rowId => writes.deleteLine(rowId)),
            ]
            if (rows.length > 0) yield rows
            yield writes.deleteHeader(variables.id)
        },
        // The Delete draft dialog shows the refusal (or it is logged once the user left).
        onError: () => {},
    })

    const confirmDelete = async () => {
        onStart()
        setDeleteError(null)
        useDepositSaveStore.getState().hold({ id, purpose: 'delete' })
        try {
            await remove.mutateAsync({ id, itemIds, lineIds })
            if (!hasLeft()) onDeleted()
        } catch (error) {
            if (isLive.current && !hasLeft()) setDeleteError(writeRefusalText(error))
            else log.warn(LOG_CONTEXT, writeRefusalText(error))
        } finally {
            useDepositSaveStore.getState().release()
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
