import { useCopyDocumentLink } from './useCopyDocumentLink'

// Copy customer link of a stored estimate: the estimate's call of useCopyDocumentLink.
export function useCopyEstimateLink(token: string) {
    return useCopyDocumentLink('estimate', token)
}
