import { type RefObject, useEffect, useRef } from 'react'
import { type TextInputInstance, View } from 'react-native'
import type { BankConnectionRow } from '../../../hooks/useBankConnections'
import { useFitsTable } from '../../../hooks/useFitsTable'
import type { MatchSuggestions } from '../../../hooks/useMatchSuggestions'
import type { ReviewBatch } from '../../../hooks/useReviewBatch'
import { type ReviewShortcutsInput, useReviewShortcuts } from '../../../hooks/useReviewShortcuts'
import {
    type ReviewQueryInput,
    type ReviewRead,
    type ReviewTabModel,
    useExcludedRows,
    useReviewedRows,
    useReviewQueryInput,
    useReviewQueueRows,
    useReviewTab,
} from '../../../hooks/useReviewTab'
import { failedResultText } from '../../../lib/bank-categorize'
import { REVIEW_TABLE_MIN_WIDTH, type ReviewTab, type TxnTab } from '../../../lib/bank-review'
import type { LiveRecovery } from '../../../lib/live-recovery'
import { useBankingUIStore } from '../../../stores/banking-ui-store'
import { AddedResultLine } from '../categorize/AddedResultLine'
import { ReviewCards } from './ReviewCards'
import { ReviewEmptyState, ReviewLoadError, ReviewLoading } from './ReviewEmptyState'
import { ReviewResultLine } from './ReviewResultLine'
import { ReviewSelectionBar } from './ReviewSelectionBar'
import { ReviewTable } from './ReviewTable'
import { ReviewToolbar } from './ReviewToolbar'

type ReviewTabBodyProps = {
    tab: TxnTab
    connection: BankConnectionRow
    currency: string
    onGoToFiles: () => void
    // The tab keys 1–4 switch the tab through the page's own tab change.
    onTab: (tab: ReviewTab) => void
    pageRecovery: LiveRecovery
    batch: ReviewBatch
    // The page's drawer, for the batch keys and Esc.
    drawer: ReviewShortcutsInput['drawer']
    // The page's read of the For review row marks; each row gets its own list.
    suggestions: MatchSuggestions
    // The page's note of the For review rows on screen, in list order, which the drawer
    // reads for the row it shows after a row leaves.
    shownRowIds: RefObject<readonly string[]>
}

type ShownRow = { id: string }

// While For review shows, the page knows its rows on screen in their order; a cleanup
// empties the note when the tab body goes or its rows change.
function useShownRowIds(
    tab: TxnTab,
    rows: readonly ShownRow[],
    shownRowIds: RefObject<readonly string[]>
) {
    useEffect(() => {
        if (tab !== 'review') return
        shownRowIds.current = rows.map(row => row.id)
        return () => {
            shownRowIds.current = []
        }
    }, [tab, rows, shownRowIds])
}

// The batch's result line, or else the outcome of the drawer's last Categorize or Record
// transfer: a failure that arrived after the drawer moved on (failedNote), or its "Added …"
// line.
function ResultLine({ result }: { result: ReviewTabModel['result'] }) {
    const failedNote = useBankingUIStore(s => s.failedNote)
    if (result) return <ReviewResultLine result={result} />
    if (failedNote) {
        const failed = { text: failedResultText(failedNote), tone: 'danger' as const }
        return <ReviewResultLine result={failed} />
    }
    return <AddedResultLine />
}

type SearchRef = RefObject<TextInputInstance | null>

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

// While rows are chosen, or the bar's own run is in flight (its rows have already left the
// list), the selection bar takes the toolbar's place.
function ToolbarOrSelection({ model, searchRef }: { model: ReviewTabModel; searchRef: SearchRef }) {
    const showsSelection = model.canChoose && (model.chosenIds.length > 0 || model.isBatchRunning)
    if (showsSelection) return <ReviewSelectionBar model={model} />
    return <ReviewToolbar model={model} searchRef={searchRef} />
}

type Fits = ReturnType<typeof useFitsTable>

// The table only where the list's own width holds it (useFitsTable); cards otherwise: on a
// phone, and beside the inline drawer, where the list's panel is narrower than the table.
function ReviewList({
    model,
    currency,
    fits,
}: {
    model: ReviewTabModel
    currency: string
    fits: Fits
}) {
    if (fits.showCards) return <ReviewCards model={model} currency={currency} />
    return <ReviewTable model={model} currency={currency} onGutter={fits.onGutter} />
}

function ReviewStateBody({
    model,
    tab,
    currency,
    onGoToFiles,
    fits,
}: {
    model: ReviewTabModel
    tab: TxnTab
    currency: string
    onGoToFiles: () => void
    fits: Fits
}) {
    if (model.viewState === 'loading') return <ReviewLoading />
    if (model.viewState === 'error') return <ReviewLoadError onRetry={model.onRetry} />
    if (model.viewState === 'ready') {
        return <ReviewList model={model} currency={currency} fits={fits} />
    }
    if (model.viewState === 'no-match') return <NoMatchState model={model} />
    const action = emptyAction(model, tab, onGoToFiles)
    return <ReviewEmptyState text={model.emptyText} action={action} />
}

type ReviewTabViewProps = ReviewTabBodyProps & {
    read: ReviewRead
    queryInput: ReviewQueryInput
}

// The shared view of a transaction tab over the read its tab body made: the toolbar (or
// the selection bar) in every view state and the last batch's result under it, then the
// list or its state. The drawer is the page's (BankingScreenView); the inline drawer
// narrows this body, so the list may change from table to cards (ReviewList), and both
// scroll to the focused row. The tab's keys are registered while this body shows, so none
// is on the Files tab.
function ReviewTabView({ read, queryInput, ...props }: ReviewTabViewProps) {
    const { tab, connection, currency, onGoToFiles, onTab, pageRecovery, batch, drawer } = props
    const { suggestions } = props
    const searchRef = useRef<TextInputInstance | null>(null)
    const model = useReviewTab({
        tab,
        connectionId: connection.id,
        waitingCount: connection.waitingCount,
        currency,
        read,
        queryInput,
        pageRecovery,
        batch,
        suggestions,
    })
    useReviewShortcuts({ ...model, tab, searchRef, onTab, drawer })
    useShownRowIds(tab, model.rows, props.shownRowIds)
    const fits = useFitsTable(REVIEW_TABLE_MIN_WIDTH)
    return (
        <View testID={`bank-tab-body-${tab}`} className="min-h-0 flex-1 overflow-hidden">
            <ToolbarOrSelection model={model} searchRef={searchRef} />
            <ResultLine result={model.result} />
            <View
                aria-busy={model.isBusy}
                className="min-h-0 min-w-0 flex-1"
                onLayout={fits.onLayout}
            >
                <ReviewStateBody
                    model={model}
                    tab={tab}
                    currency={currency}
                    onGoToFiles={onGoToFiles}
                    fits={fits}
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

function ReviewReviewedBody(props: ReviewTabBodyProps) {
    const queryInput = useReviewQueryInput('reviewed', props.connection.id, props.currency)
    const read = useReviewedRows(props.connection.id, queryInput)
    return <ReviewTabView {...props} read={read} queryInput={queryInput} />
}

function ReviewExcludedBody(props: ReviewTabBodyProps) {
    const queryInput = useReviewQueryInput('excluded', props.connection.id, props.currency)
    const read = useExcludedRows(props.connection.id, queryInput)
    return <ReviewTabView {...props} read={read} queryInput={queryInput} />
}

// One transaction tab. For review reads every row at once; Reviewed and Excluded page, and
// a paged read cannot be disabled, so each read lives in its own body (Reviewed's read also
// holds each row's match lines). Each body is keyed by its tab and account, so the rows
// kept while a new query loads are never another tab's or account's.
export function ReviewTabBody(props: ReviewTabBodyProps) {
    const { tab } = props
    const bodyKey = `${tab}-${props.connection.id}`
    if (tab === 'review') return <ReviewQueueBody key={bodyKey} {...props} />
    if (tab === 'reviewed') return <ReviewReviewedBody key={bodyKey} {...props} />
    return <ReviewExcludedBody key={bodyKey} {...props} />
}
