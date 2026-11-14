import { useState } from 'react'
import type { EstimateResponse } from './useEstimateResponse'

type Step = 'none' | 'accept' | 'decline'

// The open step of the customer's decision. It lives in PublicDecision, which shows only
// while the estimate waits for an answer: when a refusal's re-read lands on another state the
// step closes with it, and the decision comes back with no step when the estimate is Pending
// again. Each open and close starts a new answer, so no old text or refusal shows in a step.
export function useDecisionStep(response: EstimateResponse) {
    const [step, setStep] = useState<Step>('none')
    const openAccept = () => {
        response.restart()
        setStep('accept')
    }
    const openDecline = () => {
        response.restart()
        setStep('decline')
    }
    const back = () => {
        response.restart()
        setStep('none')
    }
    return { step, openAccept, openDecline, back }
}
