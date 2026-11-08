import {
    BasicIndex,
    createCollection,
    createLiveQueryCollection,
    localOnlyCollectionOptions,
} from '@tanstack/db'
import { describe, expect, it } from 'vitest'
import {
    BANK_ACCOUNT_IDS,
    BANK_ACCOUNT_TOTALS,
    BANK_ACCOUNTS,
    BANK_CONNECTION_IDS,
    BANK_CONNECTIONS,
    BANK_FILES,
} from '../tinycld/books/lib/bank-connection-fixture'
import { bankConnectionsQuery } from '../tinycld/books/lib/bank-connections-query'
import { REVIEW_TRANSACTIONS } from '../tinycld/books/lib/for-review-fixture'
import type {
    BooksAccountBalances,
    BooksAccounts,
    BooksBankConnections,
    BooksBankFiles,
    BooksBankTransactions,
} from '../tinycld/books/types'

const STAMP = '2026-01-01 00:00:00.000Z'

function balance(
    seed: Pick<BooksAccountBalances, 'id' | 'account' | 'period' | 'debit_total' | 'credit_total'>
): BooksAccountBalances {
    return { currency: 'USD', created: STAMP, updated: STAMP, ...seed }
}

// Checking's totals split across two periods, so the query must sum them; the card and
// rent in one period each; savings has no balance row.
const checkingTotals = BANK_ACCOUNT_TOTALS[BANK_ACCOUNT_IDS.checking]
const BALANCES = [
    balance({
        id: 'bal_checking_09',
        account: BANK_ACCOUNT_IDS.checking,
        period: '2026-09',
        debit_total: 2_000_000,
        credit_total: 500_000,
    }),
    balance({
        id: 'bal_checking_10',
        account: BANK_ACCOUNT_IDS.checking,
        period: '2026-10',
        debit_total: checkingTotals.debit_total - 2_000_000,
        credit_total: checkingTotals.credit_total - 500_000,
    }),
    balance({
        id: 'bal_card_10',
        account: BANK_ACCOUNT_IDS.card,
        period: '2026-10',
        ...BANK_ACCOUNT_TOTALS[BANK_ACCOUNT_IDS.card],
    }),
    balance({
        id: 'bal_rent_10',
        account: BANK_ACCOUNT_IDS.rent,
        period: '2026-10',
        ...BANK_ACCOUNT_TOTALS[BANK_ACCOUNT_IDS.rent],
    }),
]

function file(
    seed: Pick<BooksBankFiles, 'id' | 'connection' | 'status' | 'created' | 'content_hash'>
): BooksBankFiles {
    return { ...BANK_FILES[0], updated: seed.created, ...seed }
}

// Only `uploaded` files wait: the failed one is the newest on checking, so counting it
// would change both the count and the latest upload.
const FILES = [
    ...BANK_FILES,
    file({
        id: 'bankfilecard001',
        connection: BANK_CONNECTION_IDS.card,
        status: 'imported',
        created: '2026-11-01 08:00:00.000Z',
        content_hash: 'c'.repeat(64),
    }),
    file({
        id: 'bankfilechkfail',
        connection: BANK_CONNECTION_IDS.checking,
        status: 'failed',
        created: '2026-11-04 12:00:00.000Z',
        content_hash: 'f'.repeat(64),
    }),
]

function connection(
    seed: Pick<BooksBankConnections, 'id' | 'account' | 'institution' | 'account_mask'>
): BooksBankConnections {
    return { ...BANK_CONNECTIONS[0], ...seed }
}

const SAVINGS_CONNECTION = connection({
    id: 'bankconnsavings',
    account: BANK_ACCOUNT_IDS.savings,
    institution: '',
    account_mask: '',
})

const ORPHAN_CONNECTION = connection({
    id: 'bankconnorphan0',
    account: 'acct_not_loaded',
    institution: 'Gone Bank',
    account_mask: '1111',
})

function txn(
    seed: Pick<BooksBankTransactions, 'id' | 'connection' | 'status' | 'line'>
): BooksBankTransactions {
    return { ...REVIEW_TRANSACTIONS[0], ...seed }
}

// Checking has two rows for review, one excluded and one reviewed: only the two count.
// The card has one reviewed row and nothing to review; savings has no row at all.
const TRANSACTIONS = [
    txn({
        id: 'txnchkreview001',
        connection: BANK_CONNECTION_IDS.checking,
        status: 'for_review',
        line: 1,
    }),
    txn({
        id: 'txnchkreview002',
        connection: BANK_CONNECTION_IDS.checking,
        status: 'for_review',
        line: 2,
    }),
    txn({
        id: 'txnchkexclude01',
        connection: BANK_CONNECTION_IDS.checking,
        status: 'excluded',
        line: 3,
    }),
    txn({
        id: 'txnchkreviewed1',
        connection: BANK_CONNECTION_IDS.checking,
        status: 'reviewed',
        line: 4,
    }),
    txn({
        id: 'txncardreviewd1',
        connection: BANK_CONNECTION_IDS.card,
        status: 'reviewed',
        line: 1,
    }),
]

const indexed = {
    autoIndex: 'eager' as const,
    defaultIndexType: BasicIndex,
}

function bankAccount(seed: Pick<BooksAccounts, 'id' | 'name' | 'number'>): BooksAccounts {
    return { ...BANK_ACCOUNTS[0], full_name: seed.name, ...seed }
}

// Chart order (lib/account-tree.ts compareNumberThenName, id breaking a tie): numbers
// compare numerically, a number-less account sorts last, names compare without case.
// Plain string order would put '' first and '10500' before '900'. The two 1200 accounts
// tie in chart order, so the id decides; plain string order puts lowercase first.
const CHART_ORDER_ACCOUNTS = [
    bankAccount({ id: 'acct_order_pety', name: 'Petty Cash Bank', number: '' }),
    bankAccount({ id: 'acct_order_10500', name: 'Reserve Bank', number: '10500' }),
    bankAccount({ id: 'acct_order_1200b', name: 'cash drawer', number: '1200' }),
    bankAccount({ id: 'acct_order_1200a', name: 'Cash Drawer', number: '1200' }),
    bankAccount({ id: 'acct_order_1000', name: 'Main Bank', number: '1000' }),
    bankAccount({ id: 'acct_order_900', name: 'Old Bank', number: '900' }),
]

const CHART_ORDER_CONNECTIONS = CHART_ORDER_ACCOUNTS.map(row =>
    connection({
        id: `conn_${row.id}`,
        account: row.id,
        institution: 'Order Bank',
        account_mask: '0000',
    })
)

async function runQuery(
    connections: BooksBankConnections[],
    accounts = BANK_ACCOUNTS,
    transactions = TRANSACTIONS
) {
    const connectionsCollection = createCollection(
        localOnlyCollectionOptions({
            id: `bank-connections-${Math.random()}`,
            getKey: (row: BooksBankConnections) => row.id,
            initialData: connections,
            ...indexed,
        })
    )
    const accountsCollection = createCollection(
        localOnlyCollectionOptions({
            id: `bank-accounts-${Math.random()}`,
            getKey: (row: BooksAccounts) => row.id,
            initialData: accounts,
            ...indexed,
        })
    )
    const balancesCollection = createCollection(
        localOnlyCollectionOptions({
            id: `bank-balances-${Math.random()}`,
            getKey: (row: BooksAccountBalances) => row.id,
            initialData: BALANCES,
            ...indexed,
        })
    )
    const filesCollection = createCollection(
        localOnlyCollectionOptions({
            id: `bank-files-${Math.random()}`,
            getKey: (row: BooksBankFiles) => row.id,
            initialData: FILES,
            ...indexed,
        })
    )
    const transactionsCollection = createCollection(
        localOnlyCollectionOptions({
            id: `bank-transactions-${Math.random()}`,
            getKey: (row: BooksBankTransactions) => row.id,
            initialData: transactions,
            ...indexed,
        })
    )
    const live = createLiveQueryCollection({
        query: bankConnectionsQuery(
            connectionsCollection,
            accountsCollection,
            balancesCollection,
            filesCollection,
            transactionsCollection
        ),
        startSync: true,
    })
    await live.preload()
    return live.toArray
}

describe('bankConnectionsQuery', () => {
    it('gives one row per connection with its account, summed totals and waiting files', async () => {
        const rows = await runQuery(BANK_CONNECTIONS)
        expect(rows.map(row => row.id)).toEqual([
            BANK_CONNECTION_IDS.checking,
            BANK_CONNECTION_IDS.card,
        ])

        const checking = rows[0]
        expect(checking.account).toBe(BANK_ACCOUNT_IDS.checking)
        expect(checking.accountName).toBe('Business Checking')
        expect(checking.accountNumber).toBe('1000')
        expect(checking.accountType).toBe('bank')
        expect(checking.institution).toBe('First Community Bank')
        expect(checking.accountMask).toBe('4821')
        expect(checking.debitTotal).toBe(3_000_000)
        expect(checking.creditTotal).toBe(581_945)
        expect(checking.waitingCount).toBe(4)
        expect(checking.lastUploadAt).toBe('2026-11-03 16:20:00.000Z')

        const card = rows[1]
        expect(card.accountNumber).toBe('2100')
        expect(card.accountType).toBe('credit_card')
        expect(card.debitTotal).toBe(171_000)
        expect(card.creditTotal).toBe(512_017)
        expect(card.waitingCount).toBe(0)
        expect(card.lastUploadAt ?? null).toBeNull()
    })

    it('gives a connection with no balance rows zero totals, sorted by account number', async () => {
        const rows = await runQuery([...BANK_CONNECTIONS, SAVINGS_CONNECTION])
        expect(rows.map(row => row.accountNumber)).toEqual(['1000', '1010', '2100'])
        const savings = rows[1]
        expect(savings.id).toBe(SAVINGS_CONNECTION.id)
        expect(savings.accountName).toBe('Business Savings')
        expect(savings.debitTotal).toBe(0)
        expect(savings.creditTotal).toBe(0)
        expect(savings.waitingCount).toBe(0)
    })

    it('sorts the rows in chart order: numbers numerically, names without case, no number last', async () => {
        const rows = await runQuery(CHART_ORDER_CONNECTIONS, CHART_ORDER_ACCOUNTS)
        expect(rows.map(row => `${row.accountNumber} ${row.accountName}`)).toEqual([
            '900 Old Bank',
            '1000 Main Bank',
            '1200 Cash Drawer',
            '1200 cash drawer',
            '10500 Reserve Bank',
            ' Petty Cash Bank',
        ])
    })

    it('leaves out a connection whose account is not in the accounts collection', async () => {
        const rows = await runQuery([...BANK_CONNECTIONS, ORPHAN_CONNECTION])
        expect(rows.map(row => row.id)).toEqual([
            BANK_CONNECTION_IDS.checking,
            BANK_CONNECTION_IDS.card,
        ])
    })

    it('counts only the for-review transactions of each connection', async () => {
        const rows = await runQuery([...BANK_CONNECTIONS, SAVINGS_CONNECTION])
        expect(rows.map(row => [row.id, row.reviewCount])).toEqual([
            [BANK_CONNECTION_IDS.checking, 2],
            [SAVINGS_CONNECTION.id, 0],
            [BANK_CONNECTION_IDS.card, 0],
        ])
    })

    it('keeps one row per connection however many transactions it has', async () => {
        const many = Array.from({ length: 30 }, (_, index) =>
            txn({
                id: `txnchkmany${String(index).padStart(5, '0')}`,
                connection: BANK_CONNECTION_IDS.checking,
                status: index % 3 === 0 ? 'excluded' : 'for_review',
                line: index + 1,
            })
        )
        const rows = await runQuery(BANK_CONNECTIONS, BANK_ACCOUNTS, many)
        expect(rows.map(row => row.id)).toEqual([
            BANK_CONNECTION_IDS.checking,
            BANK_CONNECTION_IDS.card,
        ])
        expect(rows[0].reviewCount).toBe(20)
        expect(rows[0].waitingCount).toBe(4)
    })
})
