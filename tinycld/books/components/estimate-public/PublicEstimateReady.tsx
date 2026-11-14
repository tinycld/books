import type { PublicEstimateView } from '../../hooks/usePublicEstimate'
import { PublicEstimateCard } from './PublicEstimateCard'
import { PublicEstimateContact } from './PublicEstimateContact'

// The loaded state of the customer's page: the card and the contact line under it.
export function PublicEstimateReady({
    view,
}: {
    view: Extract<PublicEstimateView, { status: 'ready' }>
}) {
    return (
        <>
            <PublicEstimateCard view={view} />
            <PublicEstimateContact row={view.row} business={view.business} />
        </>
    )
}
