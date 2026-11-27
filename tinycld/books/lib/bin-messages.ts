// The bin texts that both the server and the screens say. server/testdata/bin_messages.json
// holds the same five texts: tests/bin-messages.test.ts compares this map with it, and
// server/bins_test.go formats the file, so a changed word fails one of the two.
import { fillPaymentText } from './payment-texts'

export const BIN_MESSAGES = {
    // The bin's name.
    nameTaken: 'A bin location named %s exists.',
    // The bin's name.
    inUse: '%s has stock or history. Make it inactive instead.',
    sameBins: 'Choose two different bin locations.',
    // The From bin's name, the quantity it holds, the most that can move.
    holds: '%s holds %s. Move %s or fewer.',
    // The From bin's name, when it holds 0 or less of the item (a bin may go below zero).
    holdsNone: '%s holds none of this item.',
} as const

export type BinMessageKey = keyof typeof BIN_MESSAGES

// The text of `key` with each `%s` filled in order.
export function binMessage(key: BinMessageKey, ...parts: string[]): string {
    return fillPaymentText(BIN_MESSAGES[key], ...parts)
}
