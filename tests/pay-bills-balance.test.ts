import { describe, expect, it } from 'vitest'
import { newBalanceCents } from '../tinycld/books/lib/pay-bills-balance'

// New balance under the list (spec §3.4): a bank account's balance less the total, a credit
// card account's balance plus the total; on `replaces` the original payment is already in
// Current balance, so it is put back first.

describe('newBalanceCents', () => {
    it('takes the total from a bank account', () => {
        expect(
            newBalanceCents({
                accountType: 'bank',
                current: 721_856,
                originalTotal: 0,
                total: 120_000,
            })
        ).toBe(601_856)
    })

    it('adds the total to a credit card account', () => {
        expect(
            newBalanceCents({
                accountType: 'credit_card',
                current: 50_000,
                originalTotal: 0,
                total: 120_000,
            })
        ).toBe(170_000)
    })

    // The view colors it; nothing blocks the payment.
    it('goes below zero for a bank account paid past its balance', () => {
        expect(
            newBalanceCents({
                accountType: 'bank',
                current: 10_000,
                originalTotal: 0,
                total: 50_000,
            })
        ).toBe(-40_000)
    })

    it('puts the original payment back first on a bank account', () => {
        expect(
            newBalanceCents({
                accountType: 'bank',
                current: 721_856,
                originalTotal: 92_000,
                total: 120_000,
            })
        ).toBe(721_856 + 92_000 - 120_000)
    })

    it('puts the original payment back first on a credit card account', () => {
        expect(
            newBalanceCents({
                accountType: 'credit_card',
                current: 50_000,
                originalTotal: 92_000,
                total: 120_000,
            })
        ).toBe(50_000 - 92_000 + 120_000)
    })
})
