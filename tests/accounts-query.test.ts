import {
    BasicIndex,
    createCollection,
    createLiveQueryCollection,
    localOnlyCollectionOptions,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import { accountsWithBalances } from '../tinycld/books/lib/accounts-query'
import { ACCOUNTS, BALANCES } from '../tinycld/books/lib/chart-of-accounts-fixture'
import type { BooksAccountBalances, BooksAccounts } from '../tinycld/books/types'

function extraBalance(
    seed: Pick<BooksAccountBalances, 'id' | 'account' | 'period' | 'debit_total' | 'credit_total'>
): BooksAccountBalances {
    return {
        currency: 'USD',
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
        ...seed,
    }
}

const indexed = {
    autoIndex: 'eager' as const,
    defaultIndexType: BasicIndex,
}

async function runQuery(accounts: BooksAccounts[], balances: BooksAccountBalances[]) {
    const accountsCollection = createCollection(
        localOnlyCollectionOptions({
            id: `accounts-${Math.random()}`,
            getKey: (a: BooksAccounts) => a.id,
            initialData: accounts,
            ...indexed,
        })
    )
    const balancesCollection = createCollection(
        localOnlyCollectionOptions({
            id: `balances-${Math.random()}`,
            getKey: (b: BooksAccountBalances) => b.id,
            initialData: balances,
            ...indexed,
        })
    )
    const live = createLiveQueryCollection({
        query: accountsWithBalances(accountsCollection, balancesCollection),
        startSync: true,
    })
    await live.preload()
    return live.toArray as Array<{ id: string; debit_total: number; credit_total: number }>
}

const threePeriods = [
    extraBalance({
        id: 'bal_multi_1',
        account: 'acct_bank_0003',
        period: '2026-10',
        debit_total: 100,
        credit_total: 7,
    }),
    extraBalance({
        id: 'bal_multi_2',
        account: 'acct_bank_0003',
        period: '2026-11',
        debit_total: 200,
        credit_total: 11,
    }),
]

describe('accountsWithBalances', () => {
    it('sums debit and credit totals across all of an account periods', async () => {
        // acct_bank_0003 already has 2026-09 (5_000_000 debit, 0 credit): three periods in all.
        const rows = await runQuery(ACCOUNTS, [...BALANCES, ...threePeriods])
        const row = rows.find(r => r.id === 'acct_bank_0003')
        expect(row?.debit_total).toBe(5_000_000 + 100 + 200)
        expect(row?.credit_total).toBe(0 + 7 + 11)
    })

    it('includes a future-dated period row in the sum', async () => {
        const future = extraBalance({
            id: 'bal_future_1',
            account: 'acct_exp_0008',
            period: '2099-12',
            debit_total: 1_000,
            credit_total: 5,
        })
        const rows = await runQuery(ACCOUNTS, [...BALANCES, future])
        const row = rows.find(r => r.id === 'acct_exp_0008')
        expect(row?.debit_total).toBe(184_220 + 1_000)
        expect(row?.credit_total).toBe(5)
    })

    it('gives an account with no balance rows zero debit and zero credit', async () => {
        const rows = await runQuery(ACCOUNTS, BALANCES)
        const row = rows.find(r => r.id === 'acct_exp_0002')
        expect(row).toBeDefined()
        expect(row?.debit_total).toBe(0)
        expect(row?.credit_total).toBe(0)
    })

    it('returns exactly one row per account', async () => {
        const rows = await runQuery(ACCOUNTS, [...BALANCES, ...threePeriods])
        expect(rows.map(r => r.id).sort()).toEqual(ACCOUNTS.map(a => a.id).sort())
    })
})
