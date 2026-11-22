import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { View } from 'react-native'
import { useFitsTable } from '../../hooks/useFitsTable'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { discardMessageText, RECONCILE_TEXTS } from '../../lib/reconcile'
import { ReconcileCards } from './ReconcileCards'
import { ReconcileFinished } from './ReconcileFinished'
import { FinishReason, ReconcileFinishButton, ReconcileHeader } from './ReconcileHeader'
import { ReconcileHintLine } from './ReconcileHintLine'
import { LINES_MIN_WIDTH } from './ReconcileRow'
import { ReconcileStartDialog } from './ReconcileStartDialog'
import { linesStateOf, ReconcileLinesStates, ReconcileStates } from './ReconcileStates'
import { ReconcileSummary } from './ReconcileSummary'
import { ReconcileTable } from './ReconcileTable'
import { ReconcileToolbar } from './ReconcileToolbar'

type Fits = ReturnType<typeof useFitsTable>

// The table at or above its own minimum width, the cards below it; never a sideways
// scroller. Empty and no-match take the list's place.
function LinesList({ model, fits }: { model: ReconcileScreenModel; fits: Fits }) {
    if (linesStateOf(model) !== 'list') return <ReconcileLinesStates model={model} />
    if (fits.showCards) return <ReconcileCards model={model} />
    return <ReconcileTable model={model} onGutter={fits.onGutter} />
}

// In progress: the toolbar, then the list, which fills the rest of the height and scrolls
// by itself. While a batch runs the list is dimmed and marked busy; while Finish is sent
// the toolbar is too, and neither takes a press.
function WorkList({ model }: { model: ReconcileScreenModel }) {
    const fits = useFitsTable(LINES_MIN_WIDTH)
    if (model.state !== 'work') return null
    const isBusy = model.clear.isBatchRunning || model.isFinishing
    const dim = isBusy ? 'opacity-60' : ''
    const toolbarDim = model.isFinishing ? 'opacity-60' : ''
    const toolbarPointer = model.isFinishing ? 'none' : 'auto'
    const listPointer = model.isFinishing ? 'none' : 'auto'
    return (
        <>
            <View
                aria-busy={model.isFinishing}
                className={toolbarDim}
                pointerEvents={toolbarPointer}
            >
                <ReconcileToolbar model={model} />
            </View>
            <View
                aria-busy={isBusy}
                className={`min-h-0 min-w-0 flex-1 ${dim}`}
                pointerEvents={listPointer}
                onLayout={fits.onLayout}
            >
                <LinesList model={model} fits={fits} />
            </View>
        </>
    )
}

function WorkBand({ model }: { model: ReconcileScreenModel }) {
    if (model.state !== 'work') return null
    return <ReconcileSummary model={model} />
}

// The phone's Finish: a bar at the bottom of the screen, with why it is disabled.
function PhoneFinishBar({ model }: { model: ReconcileScreenModel }) {
    if (model.isWide || !model.canWrite || model.state !== 'work') return null
    return (
        <View
            testID="reconcile-finish-bar"
            className="gap-1 border-t border-border bg-background px-4 py-3"
        >
            <ReconcileFinishButton model={model} isFull />
            <FinishReason model={model} align="center" />
        </View>
    )
}

// Edit info's statement dialog and Discard's confirm, for a writer's reconciliation in
// progress.
function WorkDialogs({ model }: { model: ReconcileScreenModel }) {
    const { actions } = model
    const isDiscardOpen = actions.isDiscardOpen && model.reconciliation !== undefined
    const message = discardMessageText(model.clearedCount)
    return (
        <>
            <ReconcileStartDialog mode="edit" target={model.editTarget} />
            <ConfirmDialog
                isOpen={isDiscardOpen}
                onClose={actions.onCloseDiscard}
                onConfirm={actions.onConfirmDiscard}
                title={RECONCILE_TEXTS.discardTitle}
                message={message}
                confirmLabel={RECONCILE_TEXTS.discardConfirm}
                isDestructive
                isSubmitting={actions.isDiscarding}
                confirmTestID="reconcile-discard-confirm"
            />
        </>
    )
}

/**
 * The screen of `books/reconcile/<id>` (reconcile spec §3 "The work screen", "The finished
 * summary"): a fixed column of the header, then in progress the summary band, the hint line,
 * the toolbar and the list (table or cards) of the transactions to clear, with the phone's
 * Finish bar at the bottom; finished, the summary block; or the loading, error or not-found
 * state under the back link.
 */
export function ReconcileScreenView(model: ReconcileScreenModel) {
    const padding = model.isWide ? 'px-6 pt-4' : 'px-4 pt-2'
    return (
        <View className="min-h-0 flex-1 bg-background">
            <View testID="reconcile-screen" className={`min-h-0 flex-1 gap-3 ${padding}`}>
                <ReconcileHeader model={model} />
                <ReconcileStates model={model} />
                <WorkBand model={model} />
                <ReconcileHintLine model={model} />
                <WorkList model={model} />
                <ReconcileFinished model={model} />
            </View>
            <PhoneFinishBar model={model} />
            <WorkDialogs model={model} />
        </View>
    )
}
