// Account rows for the sales tax dialog tests: the seeded e2e book's chart
// (lib/seed-accounts.ts) with ids `acc-<number>`, plus fictional accounts a test adds.
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import type { BooksAccounts } from '../tinycld/books/types'

const STAMP = '2026-01-01 00:00:00.000Z'

type AccountSeed = Pick<BooksAccounts, 'number' | 'name' | 'type' | 'detail_type'> &
    Partial<BooksAccounts>

export function taxAccount(seed: AccountSeed): BooksAccounts {
    return {
        id: `acc-${seed.number}`,
        description: '',
        inactive: false,
        currency: 'USD',
        form_1099_box: '',
        parent: '',
        created: STAMP,
        updated: STAMP,
        full_name: seed.name,
        ...seed,
    }
}

const numberOfKey = new Map(SEED_ACCOUNTS.map(account => [account.key, account.number]))
const nameOfKey = new Map(SEED_ACCOUNTS.map(account => [account.key, account.name]))

// The seeded chart nests one level deep, so a sub-account's path is its parent's name and its own.
function seedFullName(account: (typeof SEED_ACCOUNTS)[number]) {
    return account.parent ? `${nameOfKey.get(account.parent)}:${account.name}` : account.name
}

// The seeded chart, which holds one Other current liability account: 2200 Sales tax payable.
export function seedChart(): BooksAccounts[] {
    return SEED_ACCOUNTS.map(account =>
        taxAccount({
            number: account.number,
            name: account.name,
            type: account.type,
            detail_type: account.detail_type,
            parent: account.parent ? `acc-${numberOfKey.get(account.parent)}` : '',
            full_name: seedFullName(account),
            inactive: account.inactive ?? false,
        })
    )
}

// The seeded chart without 2200, so it has no Other current liability account at all.
export function chartWithoutLiability(): BooksAccounts[] {
    return seedChart().filter(account => account.type !== 'other_current_liability')
}
