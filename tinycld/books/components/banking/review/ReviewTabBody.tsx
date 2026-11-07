import { View } from 'react-native'
import type { BankConnectionRow } from '../../../hooks/useBankConnections'
import {
    type ReviewRead,
    type ReviewTabModel,
    useReviewPagedRows,
    useReviewQueueRows,
    useReviewTab,
} from '../../../hooks/useReviewTab'
import { connectionLabel } from '../../../lib/bank-connections'
import type { TxnTab } from '../../../lib/bank-review'
import type { LiveRecovery } from '../../../lib/live-recovery'
import { ReviewCards } from './ReviewCards'
import { ReviewEmptyState, ReviewLoadError, ReviewLoading } from './ReviewEmptyState'
import { ReviewTable } from './ReviewTable'

type ReviewTabBodyProps = {
    tab: TxnTab
    connection: BankConnectionRow
    currency: string
    onGoToFiles: () => void
    pageRecovery: LiveRecovery
}

// Uploading and importing are writer actions, so only a writer on For review is sent to
// the Files tab; a reader still has the tab bar.
function emptyAction(model: ReviewTabModel, tab: TxnTab, onGoToFiles: () => void) {
    if (tab !== 'review' || !model.canWrite) return null
    return { label: 'Go to files', onPress: onGoToFiles }
}

function ReviewList({ model, currency }: { model: ReviewTabModel; currency: string }) {
    if (model.isWide) return <ReviewTable model={model} currency={currency} />
    return <ReviewCards model={model} currency={currency} />
}

function ReviewStateBody({
    model,
    tab,
    currency,
    onGoToFiles,
}: {
    model: ReviewTabModel
    tab: TxnTab
    currency: string
    onGoToFiles: () => void
}) {
    if (model.viewState === 'loading') return <ReviewLoading />
    if (model.viewState === 'error') return <ReviewLoadError onRetry={model.onRetry} />
    if (model.viewState === 'ready') return <ReviewList model={model} currency={currency} />
    const action = emptyAction(model, tab, onGoToFiles)
    return <ReviewEmptyState text={model.emptyText} action={action} />
}

// The shared view of a transaction tab over the read its tab body made.
function ReviewTabView({ read, ...props }: ReviewTabBodyProps & { read: ReviewRead }) {
    const { tab, connection, currency, onGoToFiles, pageRecovery } = props
    const model = useReviewTab({
        tab,
        connectionId: connection.id,
        accountLabel: connectionLabel(connection.accountNumber, connection.accountName),
        waitingCount: connection.waitingCount,
        currency,
        read,
        pageRecovery,
    })
    return (
        <View testID={`bank-tab-body-${tab}`} className="min-h-0 flex-1 overflow-hidden">
            <ReviewStateBody
                model={model}
                tab={tab}
                currency={currency}
                onGoToFiles={onGoToFiles}
            />
        </View>
    )
}

function ReviewQueueBody(props: ReviewTabBodyProps) {
    const read = useReviewQueueRows(props.connection.id)
    return <ReviewTabView {...props} read={read} />
}

function ReviewPagedBody(props: ReviewTabBodyProps & { tab: 'reviewed' | 'excluded' }) {
    const read = useReviewPagedRows(props.tab, props.connection.id)
    return <ReviewTabView {...props} read={read} />
}

// One transaction tab. For review reads every row at once; Reviewed and Excluded page, and
// a paged read cannot be disabled, so each read lives in its own body.
export function ReviewTabBody(props: ReviewTabBodyProps) {
    const { tab } = props
    if (tab === 'review') return <ReviewQueueBody {...props} />
    return <ReviewPagedBody key={tab} {...props} tab={tab} />
}
