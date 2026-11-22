import { View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { ReconcileHeader } from './ReconcileHeader'
import { ReconcileStates } from './ReconcileStates'
import { ReconcileSummary } from './ReconcileSummary'

function WorkBody({ model }: { model: ReconcileScreenModel }) {
    const isShown = model.state === 'work' || model.state === 'finished'
    if (!isShown) return null
    return <ReconcileSummary model={model} />
}

/**
 * The screen of `books/reconcile/<id>` (reconcile spec §3 "The work screen"): the header
 * and the summary band of a reconciliation in progress or finished, or the loading, error
 * or not-found state under the back link. The lines and their actions are checkpoint 3's.
 */
export function ReconcileScreenView(model: ReconcileScreenModel) {
    const padding = model.isWide ? 'px-6 pt-4' : 'px-4 pt-2'
    return (
        <View testID="reconcile-screen" className={`flex-1 gap-3 bg-background ${padding}`}>
            <ReconcileHeader model={model} />
            <ReconcileStates model={model} />
            <WorkBody model={model} />
        </View>
    )
}
