import { getResolvedAddress } from '@tinycld/core/lib/server-address'

// The customer's link to one estimate (spec §3.1): the public page on this server.
export function estimateLinkUrl(
    token: string,
    address: string = getResolvedAddress() ?? ''
): string {
    const base = address.replace(/\/+$/, '')
    return `${base}/p/books/estimates/${token}`
}
