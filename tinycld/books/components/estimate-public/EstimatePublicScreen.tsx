import { DocumentTitle } from '@tinycld/core/components/DocumentTitle'
import { ScrollView } from 'react-native'
import { type PublicEstimateView, usePublicEstimate } from '../../hooks/usePublicEstimate'
import { PUBLIC_TEXTS, publicTitleOf } from '../../lib/estimate-public'
import { PublicEstimateFrame } from './PublicEstimateFrame'
import { PublicEstimateReady } from './PublicEstimateReady'
import { PublicLoadError, PublicLoading, PublicNotFound } from './PublicEstimateStates'

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
    // Core cuts a long title at 40 characters and puts the org first otherwise.
    const title = ready
        ? publicTitleOf(ready.row.number, ready.business)
        : PUBLIC_TEXTS.loadingTitle
    return (
        <ScrollView
            className="flex-1 bg-background"
            contentContainerClassName="items-center px-4 py-8"
        >
            <DocumentTitle title={title} includeOrg={false} maxDetailChars={Infinity} />
            <PublicEstimateFrame>
                <PublicLoading isVisible={view.status === 'loading'} />
                <PublicNotFound isVisible={view.status === 'not-found'} />
                <PublicLoadError isVisible={view.status === 'error'} onRetry={retry} />
                <ReadyState view={ready} />
            </PublicEstimateFrame>
        </ScrollView>
    )
}
