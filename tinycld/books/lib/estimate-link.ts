import { documentLinkUrl } from './document-link'

// The customer's link to one estimate (spec §3.1): the public page on this server.
export function estimateLinkUrl(token: string, address?: string): string {
    return documentLinkUrl('estimate', token, address)
}
