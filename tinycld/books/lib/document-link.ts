import { getResolvedAddress } from '@tinycld/core/lib/server-address'

export type LinkedKind = 'invoice' | 'estimate'

// The public route of each kind that has a customer page (public-screens/<route>/[token]).
const PUBLIC_ROUTES: Record<LinkedKind, string> = {
    invoice: 'invoices',
    estimate: 'estimates',
}

// The customer's link to one document (spec §3.5): its public page on this server.
export function documentLinkUrl(
    kind: LinkedKind,
    token: string,
    address: string = getResolvedAddress() ?? ''
): string {
    const base = address.replace(/\/+$/, '')
    return `${base}/p/books/${PUBLIC_ROUTES[kind]}/${token}`
}
