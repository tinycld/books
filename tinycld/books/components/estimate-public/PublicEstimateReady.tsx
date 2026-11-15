import { useEstimateResponse } from '../../hooks/useEstimateResponse'
import type { PublicEstimateView } from '../../hooks/usePublicEstimate'
import { PublicDecision } from './PublicDecision'
import { PublicEstimateCard } from './PublicEstimateCard'
import { PublicEstimateContact } from './PublicEstimateContact'

// The loaded state of the customer's page: the card with the decision, and the contact line
// under it. It stays mounted through the re-read after an answer, so a refusal stays on
// screen above the state the estimate is in now.
export function PublicEstimateReady({
    view,
}: {
    view: Extract<PublicEstimateView, { status: 'ready' }>
}) {
    const response = useEstimateResponse(view.row, view.reload)
    const isDeciding = view.outcome === 'decide'
    const decision = isDeciding ? (
        <PublicDecision response={response} business={view.business} />
    ) : null
    // While the decision is still offered the open step's summary already shows the
    // refusal; the card shows it only above another state's text.
    const refusal = isDeciding ? '' : response.refusal
    return (
        <>
            <PublicEstimateCard view={view} decision={decision} refusal={refusal} />
            <PublicEstimateContact row={view.row} business={view.business} />
        </>
    )
}
