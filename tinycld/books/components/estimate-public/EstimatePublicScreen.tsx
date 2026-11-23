import { DocumentTitle } from '@tinycld/core/components/DocumentTitle'
import { ScrollView } from 'react-native'
import { type PublicEstimateView, usePublicEstimate } from '../../hooks/usePublicEstimate'
import { PUBLIC_TEXTS, publicTitleOf } from '../../lib/estimate-public'
import { PublicFrame } from '../public/PublicFrame'
import { PublicLoadError, PublicLoading, PublicNotFound } from '../public/PublicStates'
import { PublicEstimateReady } from './PublicEstimateReady'

const TEST_ID_PREFIX = 'estimate-public'

type ReadyView = Extract<PublicEstimateView, { status: 'ready' }>

function ReadyState({ view }: { view: ReadyView | null }) {
    if (view === null) return null
    return <PublicEstimateReady view={view} />
}

function noRetry() {}

// The customer's estimate page (spec §3.2, §3.4), outside the auth gate: one card, no
// app chrome.
export function EstimatePublicScreen({ token }: { token: string }) {
    const view = usePublicEstimate(token)
    const ready = view.status === 'ready' ? view : null
    const retry = view.status === 'error' ? view.retry : noRetry
    // Without the brand, core sets the title exactly: no app name, no org, no cut (spec §7
    // spark 2: the customer's page shows the business, not the app).
    const title = ready
        ? publicTitleOf(ready.row.number, ready.business)
        : PUBLIC_TEXTS.loadingTitle
    return (
        <ScrollView
            className="flex-1 bg-background"
            contentContainerClassName="items-center px-4 py-8"
        >
            <DocumentTitle title={title} includeBrand={false} />
            <PublicFrame>
                <PublicLoading
                    isVisible={view.status === 'loading'}
                    testIdPrefix={TEST_ID_PREFIX}
                    text={PUBLIC_TEXTS.loading}
                />
                <PublicNotFound
                    isVisible={view.status === 'not-found'}
                    testIdPrefix={TEST_ID_PREFIX}
                    title={PUBLIC_TEXTS.notFound}
                    hint={PUBLIC_TEXTS.notFoundHint}
                />
                <PublicLoadError
                    isVisible={view.status === 'error'}
                    testIdPrefix={TEST_ID_PREFIX}
                    message={PUBLIC_TEXTS.loadError}
                    retryLabel={PUBLIC_TEXTS.retry}
                    onRetry={retry}
                />
                <ReadyState view={ready} />
            </PublicFrame>
        </ScrollView>
    )
}
