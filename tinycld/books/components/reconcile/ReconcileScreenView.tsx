import { View } from 'react-native'
import { useFitsTable } from '../../hooks/useFitsTable'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { ReconcileCards } from './ReconcileCards'
import { ReconcileHeader } from './ReconcileHeader'
import { LINES_MIN_WIDTH } from './ReconcileRow'
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
// by itself; dimmed and marked busy while a batch runs.
function WorkList({ model }: { model: ReconcileScreenModel }) {
    const fits = useFitsTable(LINES_MIN_WIDTH)
    if (model.state !== 'work') return null
    const isBusy = model.clear.isBatchRunning
    const dim = isBusy ? 'opacity-60' : ''
    return (
        <>
            <ReconcileToolbar model={model} />
            <View
                aria-busy={isBusy}
                className={`min-h-0 min-w-0 flex-1 ${dim}`}
                onLayout={fits.onLayout}
            >
                <LinesList model={model} fits={fits} />
            </View>
        </>
    )
}

function WorkBody({ model }: { model: ReconcileScreenModel }) {
    const isShown = model.state === 'work' || model.state === 'finished'
    if (!isShown) return null
    return <ReconcileSummary model={model} />
}

/**
 * The screen of `books/reconcile/<id>` (reconcile spec §3 "The work screen"): a fixed
 * column of the header and the summary band of a reconciliation in progress or finished,
 * then, in progress, the toolbar and the list (table or cards) of the transactions to
 * clear; or the loading, error or not-found state under the back link. The header's
 * actions and the hint line are checkpoint 4's.
 */
export function ReconcileScreenView(model: ReconcileScreenModel) {
    const padding = model.isWide ? 'px-6 pt-4' : 'px-4 pt-2'
    return (
        <View testID="reconcile-screen" className={`min-h-0 flex-1 gap-3 bg-background ${padding}`}>
            <ReconcileHeader model={model} />
            <ReconcileStates model={model} />
            <WorkBody model={model} />
            <WorkList model={model} />
        </View>
    )
}
