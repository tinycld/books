import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { DocumentTitle } from '@tinycld/core/components/DocumentTitle'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { getShareToken, setShareToken } from '@tinycld/core/lib/share-token'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { ScrollView } from 'react-native'
import {
    INVOICE_PUBLIC_TEXTS,
    invoicePublicState,
    invoicePublicTitleOf,
} from '../../lib/invoice-public'
import { businessNameOf } from '../../lib/public-page'
import { todayIso } from '../../lib/register-range'
import { PublicContact } from '../public/PublicContact'
import { PublicFrame } from '../public/PublicFrame'
import { PublicLoadError, PublicLoading, PublicNotFound } from '../public/PublicStates'
import { type InvoicePublicView, PublicInvoiceCard } from './PublicInvoiceCard'

const TEST_ID_PREFIX = 'invoice-public'

function ReadyState({ view }: { view: InvoicePublicView | null }) {
    if (view === null) return null
    const business = {
        name: view.business,
        email: view.row.business_email,
        phone: view.row.business_phone,
    }
    return (
        <>
            <PublicInvoiceCard view={view} />
            <PublicContact business={business} testIdPrefix={TEST_ID_PREFIX} />
        </>
    )
}

// The customer's invoice page (email-share spec §3.5), outside the auth gate: one card, no
// app chrome. The view is not pushed live to a signed-out reader (no liveTopics): it shows
// a change on its next read, which pbtsdb runs on foreground, network back and reload.
export function InvoicePublicScreen({ token }: { token: string }) {
    // A module value, not React state: the view's rule reads the header, so the first
    // request of the query below must already carry it.
    if (getShareToken() !== token) setShareToken(token)
    const [publicCollection] = useStore('books_invoice_public')
    const { org } = useOrgInfo()
    const query = useLiveQuery({
        query: q =>
            q
                .from({ row: publicCollection })
                .where(({ row }) => eq(row.token, token))
                .findOne(),
        queryKey: ['books.invoice-public', token],
    })

    // A failed live query stays failed on a reload of its collection; restart it.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [publicCollection],
            onError: err => log.error('books.invoice-public', err),
        })
    }

    const isError = query.isError
    const isLoading = !isError && !query.isReady
    const row = isError || isLoading ? undefined : query.data
    const state = invoicePublicState(row, todayIso())
    const isNotFound = !isError && !isLoading && state === 'not-found'
    const ready =
        row === undefined ? null : { row, state, business: businessNameOf(row, org?.name ?? '') }
    const title = ready
        ? invoicePublicTitleOf(ready.row.number, ready.business)
        : INVOICE_PUBLIC_TEXTS.loadingTitle
    return (
        <ScrollView
            className="flex-1 bg-background"
            contentContainerClassName="items-center px-4 py-8"
        >
            <DocumentTitle title={title} includeBrand={false} />
            <PublicFrame>
                <PublicLoading
                    isVisible={isLoading}
                    testIdPrefix={TEST_ID_PREFIX}
                    text={INVOICE_PUBLIC_TEXTS.loading}
                />
                <PublicNotFound
                    isVisible={isNotFound}
                    testIdPrefix={TEST_ID_PREFIX}
                    title={INVOICE_PUBLIC_TEXTS.notFound}
                    hint={INVOICE_PUBLIC_TEXTS.notFoundHint}
                />
                <PublicLoadError
                    isVisible={isError}
                    testIdPrefix={TEST_ID_PREFIX}
                    message={INVOICE_PUBLIC_TEXTS.loadError}
                    retryLabel={INVOICE_PUBLIC_TEXTS.retry}
                    onRetry={retry}
                />
                <ReadyState view={ready} />
            </PublicFrame>
        </ScrollView>
    )
}
