import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useEffect, useRef, useState } from 'react'
import { type AdjustmentStale, adjustmentStale } from '../lib/adjustment-actions'
import { type AdjustmentScreenState, adjustmentScreenState } from '../lib/adjustment-screen-state'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useAdjustmentSaveStore } from '../stores/adjustment-save-store'
import { type AdjustmentRecordView, useAdjustmentRecord } from './useAdjustmentRecord'
import { useBooksAccess } from './useBooksAccess'
import { useHasBinsQuery } from './useHasBins'
import { useRecostSourceNumber } from './useRecostSourceNumber'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

type Header = AdjustmentRecordView['adjustment']
type Lines = AdjustmentRecordView['lines']

export interface AdjustmentScreenQuery {
    // `?replaces`: the posted adjustment a correction edits.
    replaces?: string
    // `?copy`: the adjustment a new one starts from.
    copy?: string
}

// While a save or delete holds the adjustment, or the form of a draft that changed
// elsewhere stays up, the last rows read stand in for the live ones (a delete removes the
// row before the server answers, a post flips its status), so the form keeps its record
// (useDepositScreen's useHeldDeposit).
function useHeldRecord(record: AdjustmentRecordView, isHeld: boolean) {
    const last = useRef<{ adjustment: Header; lines: Lines }>({
        adjustment: record.adjustment,
        lines: record.lines,
    })
    if (record.adjustment) last.current = { adjustment: record.adjustment, lines: record.lines }
    if (!isHeld || record.adjustment) return record
    return { ...record, ...last.current }
}

/**
 * Marks the stored draft whose form shows in the save store (`shownDraft`) from the form's
 * mount to its unmount; null for a form of no stored draft. The id is the one the form
 * mounted with.
 */
export function useShownDraft(id: string | null) {
    useEffect(() => {
        if (id === null) return
        const store = useAdjustmentSaveStore.getState()
        store.showDraft(id)
        return () => useAdjustmentSaveStore.getState().hideDraft(id)
    }, [id])
}

/**
 * The stale state of a stored draft's form (spec §3.13): while the draft's form shows (the
 * save store's `shownDraft`, useShownDraft), a post or a delete by someone else keeps the
 * form with the notice (adjustmentStale) until the person loads the current adjustment
 * (`loadCurrent`); then the screen shows what the adjustment is now. An own save, post or
 * delete holds the draft, and an own post or delete that worked clears `shownDraft` before
 * the hold ends, so the own post moves on to the read view.
 */
function useStaleDraft(input: {
    id: string | null
    record: AdjustmentRecordView
    isHeld: boolean
}) {
    const { id, record, isHeld } = input
    const [isLoadedAgain, setLoadedAgain] = useState(false)
    const isShown = useAdjustmentSaveStore(state => id !== null && state.shownDraft === id)
    const stale: AdjustmentStale = isShown
        ? adjustmentStale({
              formStatus: 'draft',
              live: record.adjustment ?? undefined,
              isLoaded: record.isReady && !record.isError,
              isHeld,
          })
        : 'none'
    const keepsForm = stale !== 'none' && !isLoadedAgain
    return {
        stale: keepsForm ? stale : 'none',
        keepsForm,
        loadCurrent: () => setLoadedAgain(true),
    }
}

/**
 * Every read of the inventory adjustment screen (inventory-adjust spec §3.2, §3.4, §3.5,
 * §3.13): access, the adjustment at `id` with its lines, whether the book has a bin
 * location (the Bin column), the number of a re-cost's source document
 * (useRecostSourceNumber), and the adjustment a new form starts from: `?replaces` (a
 * correction), `?copy`, or the `replaces` of a stored correction draft (a correction whose
 * post was refused after its draft was written). A save that holds this adjustment
 * (stores/adjustment-save-store.ts) keeps the form, and so does this form's own correction
 * while its post voids the original (`correcting`). Returns which surface to show
 * (adjustmentScreenState), the source with its mode, the stale state of a draft's form, and
 * one Retry over every failed read (merged recoveries). `id` is null at
 * `books/inventory-adjustments/new`.
 */
export function useAdjustmentScreen(id: string | null, query: AdjustmentScreenQuery = {}) {
    const access = useBooksAccess()
    const live = useAdjustmentRecord(id ?? '')
    const bins = useHasBinsQuery()
    // A save of this adjustment's form runs: its optimistic `posted` keeps the form.
    const isHeld = useAdjustmentSaveStore(state => id !== null && state.holding?.id === id)
    const staleDraft = useStaleDraft({ id, record: live, isHeld })
    const record = useHeldRecord(live, isHeld || staleDraft.keepsForm)
    const source = useRecostSourceNumber(record.adjustment)
    const isDraftForm = record.adjustment?.status === 'draft' || isHeld
    const draftReplaces = isDraftForm ? (record.adjustment?.replaces ?? '') : ''
    // An empty `?replaces` is a correction too: it reads no row, so it "cannot be edited",
    // and never falls back to a blank form that would post beside the original.
    const replaces = id === null ? query.replaces : draftReplaces || undefined
    const copy = id === null && replaces === undefined ? query.copy || undefined : undefined
    const start = useAdjustmentRecord(replaces ?? copy ?? '')
    const isCorrecting = useAdjustmentSaveStore(
        state => replaces !== undefined && replaces !== '' && state.correcting === replaces
    )
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [] }
        : NO_RECOVERY
    const recovery = mergeRecoveries([
        accessRecovery,
        record.recovery,
        bins.recovery,
        source.recovery,
        start.recovery,
    ])
    // A copy's source is one of the screen's reads; a correction's original has its own
    // inputs (a missing or uncorrectable original is "cannot be edited").
    const copyReady = copy === undefined || start.isReady
    const copyError = copy !== undefined && start.isError
    const isReplaces = replaces !== undefined
    const computed = adjustmentScreenState({
        isReady: access.isReady && record.isReady && bins.isReady && source.isReady && copyReady,
        isError: access.isError || record.isError || bins.isError || source.isError || copyError,
        canWrite: access.canWrite,
        isNew: id === null,
        status: record.adjustment?.status ?? null,
        isHeld,
        replacesStatus: isReplaces ? (start.adjustment?.status ?? null) : undefined,
        replacesKind: isReplaces ? (start.adjustment?.kind ?? null) : undefined,
        replacesReady: start.isReady,
        replacesError: start.isError,
        isCorrecting,
    })
    const state: AdjustmentScreenState = staleDraft.keepsForm ? 'form' : computed
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.inventory-adjustment', err),
        })
    }
    const startMode = isReplaces ? ('replaces' as const) : ('copy' as const)
    const startRecord =
        start.adjustment && (isReplaces || copy !== undefined)
            ? { mode: startMode, adjustment: start.adjustment, lines: start.lines }
            : null
    return {
        state,
        record,
        hasBins: bins.hasBins === true,
        sourceNumber: source.number,
        canWrite: access.canWrite,
        // The posted adjustment this form corrects ('' for none).
        replaces: replaces ?? '',
        // The adjustment a new form starts from (a correction's original or a copy's
        // source), or a stored correction draft's original; null without one.
        start: startRecord,
        stale: staleDraft.stale,
        loadCurrent: staleDraft.loadCurrent,
        retry,
    }
}

export type AdjustmentScreenData = ReturnType<typeof useAdjustmentScreen>
export type AdjustmentStart = NonNullable<AdjustmentScreenData['start']>
