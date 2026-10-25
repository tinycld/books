// These strings mirror refusals in server/opening_balances.go and server/reversal.go.
// tests/opening-balances-messages.test.ts fails if the server wording drifts.
import { formatDay } from './register-range'

export function closedThroughMessage(closeDate: string): string {
    return `Books are closed through ${formatDay(closeDate)}. Pick a later date.`
}

export function alreadyEnteredMessage(number: string): string {
    return `Opening balances are already entered (${number}). Edit that entry.`
}

export const onlyOpeningScreenMessage =
    'An opening balance entry can be edited only on the Opening balances screen.'

export const tooManyAmountsMessage =
    'Too many amounts. Enter 999 or fewer, because the balancing line counts as one.'

export const tooLargeLabel = 'Too large'

export function problemMessage(problem: 'too-large' | 'too-many-lines' | null): string | null {
    if (problem === 'too-large') return tooLargeLabel
    if (problem === 'too-many-lines') return tooManyAmountsMessage
    return null
}
