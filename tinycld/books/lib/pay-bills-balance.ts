// New balance under the list (spec §3.4): a bank account's balance less the total, a
// credit card account's balance plus the total (what is owed on it grows). On `?replaces`
// Current balance already holds the original payment, so it is put back first. Cents in,
// cents out; a bank account may go below zero (the view colors it; nothing blocks).

export function newBalanceCents(input: {
    accountType: 'bank' | 'credit_card'
    current: number
    originalTotal: number
    total: number
}): number {
    const change = input.total - input.originalTotal
    return input.accountType === 'credit_card' ? input.current + change : input.current - change
}
