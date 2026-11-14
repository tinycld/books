import { z } from '@tinycld/core/ui/form'
import { ClientResponseError } from 'pocketbase'

// The customer's answer on the public estimate page (spec §3.3). The name's message is the
// server's msgResponseNameRequired (server/estimate_responses.go); its bounds are the
// books_estimate_responses field limits (name 200, reason 1000).
export const acceptSchema = z.object({
    name: z.string().trim().min(1, 'Enter your name.').max(200, 'Use 200 characters or fewer.'),
})

// A blank or space-only reason is sent as an empty string.
export const declineSchema = z.object({
    reason: z.string().trim().max(1000, 'Use 1000 characters or fewer.'),
})

export type AcceptValues = z.infer<typeof acceptSchema>
export type DeclineValues = z.infer<typeof declineSchema>

export const RESPONSE_NETWORK_TEXT = 'Could not send. Check your connection and try again.'

// A write that got no answer: the SDK reports a failed or aborted fetch as status 0, and
// anything that is not a PocketBase error never reached the server's rules.
export function isNetworkFailure(error: unknown): boolean {
    if (!(error instanceof ClientResponseError)) return true
    return error.status === 0
}
