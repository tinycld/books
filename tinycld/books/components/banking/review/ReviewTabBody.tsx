import { View } from 'react-native'
import type { BankConnectionRow } from '../../../hooks/useBankConnections'
import {
    type ReviewQueryInput,
    type ReviewRead,
    type ReviewTabModel,
    useReviewPagedRows,
    useReviewQueryInput,
    useReviewQueueRows,
    useReviewTab,
} from '../../../hooks/useReviewTab'
import { connectionLabel } from '../../../lib/bank-connections'
import type { TxnTab } from '../../../lib/bank-review'
import type { LiveRecovery } from '../../../lib/live-recovery'
import { ReviewCards } from './ReviewCards'
import { ReviewEmptyState, ReviewLoadError, ReviewLoading } from './ReviewEmptyState'
import { ReviewTable } from './ReviewTable'
import { ReviewToolbar } from './ReviewToolbar'

type ReviewTabBodyProps = {
    tab: TxnTab
    connection: BankConnectionRow
    currency: string
    onGoToFiles: () => void
    pageRecovery: LiveRecovery
}

const NO_MATCH_TEXT = 'No transactions match these filters.'

// Uploading and importing are writer actions, so only a writer on For review is sent to
// the Files tab; a reader still has the tab bar.
function emptyAction(model: ReviewTabModel, tab: TxnTab, onGoToFiles: () => void) {
    if (tab !== 'review' || !model.canWrite) return null
    return { label: 'Go to files', onPress: onGoToFiles }
}

// Clearing the filters changes no data, so every user gets it on every transaction tab.
function NoMatchState({ model }: { model: ReviewTabModel }) {
    const action = { label: 'Clear filters', onPress: model.onClearFilters }
    return <ReviewEmptyState text={NO_MATCH_TEXT} action={action} />
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
    if (model.viewState === 'no-match') return <NoMatchState model={model} />
    const action = emptyAction(model, tab, onGoToFiles)
    return <ReviewEmptyState text={model.emptyText} action={action} />
}

type ReviewTabViewProps = ReviewTabBodyProps & {
    read: ReviewRead
    queryInput: ReviewQueryInput
}

// The shared view of a transaction tab over the read its tab body made: the toolbar in
// every view state, then the list or its state.
function ReviewTabView({ read, queryInput, ...props }: ReviewTabViewProps) {
    const { tab, connection, currency, onGoToFiles, pageRecovery } = props
    const model = useReviewTab({
        tab,
        connectionId: connection.id,
        accountLabel: connectionLabel(connection.accountNumber, connection.accountName),
        waitingCount: connection.waitingCount,
        currency,
        read,
        queryInput,
        pageRecovery,
    })
    return (
        <View testID={`bank-tab-body-${tab}`} className="min-h-0 flex-1 overflow-hidden">
            <ReviewToolbar model={model} />
            <View aria-busy={model.isBusy} className="min-h-0 flex-1">
                <ReviewStateBody
                    model={model}
                    tab={tab}
                    currency={currency}
                    onGoToFiles={onGoToFiles}
                />
            </View>
        </View>
    )
}

function ReviewQueueBody(props: ReviewTabBodyProps) {
    const queryInput = useReviewQueryInput('review', props.connection.id, props.currency)
    const read = useReviewQueueRows(props.connection.id, queryInput)
    return <ReviewTabView {...props} read={read} queryInput={queryInput} />
}

function ReviewPagedBody(props: ReviewTabBodyProps & { tab: 'reviewed' | 'excluded' }) {
    const queryInput = useReviewQueryInput(props.tab, props.connection.id, props.currency)
    const read = useReviewPagedRows(props.tab, props.connection.id, queryInput)
    return <ReviewTabView {...props} read={read} queryInput={queryInput} />
}

// One transaction tab. For review reads every row at once; Reviewed and Excluded page, and
// a paged read cannot be disabled, so each read lives in its own body. Each body is keyed
// by its tab and account, so the rows kept while a new query loads are never another
// tab's or account's.
export function ReviewTabBody(props: ReviewTabBodyProps) {
    const { tab } = props
    const bodyKey = `${tab}-${props.connection.id}`
    if (tab === 'review') return <ReviewQueueBody key={bodyKey} {...props} />
    return <ReviewPagedBody key={bodyKey} {...props} tab={tab} />
}
