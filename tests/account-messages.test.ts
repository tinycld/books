import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    BOX_NEEDS_EXPENSE_TYPE,
    deleteBlockedMessage,
    inactiveRefusalMessage,
    typeLockMessage,
} from '../tinycld/books/lib/account-messages'

const serverSource = readFileSync(join(__dirname, '..', 'server', 'accounts.go'), 'utf8')

const BOX_NEEDS_EXPENSE_TYPE_TEXT =
    'Only expense accounts can be reported on a 1099. Set this account to Not reported in Settings → 1099s first.'

describe('BOX_NEEDS_EXPENSE_TYPE', () => {
    it('is the text of the plan Decisions', () => {
        expect(BOX_NEEDS_EXPENSE_TYPE).toBe(BOX_NEEDS_EXPENSE_TYPE_TEXT)
    })
})

describe('typeLockMessage', () => {
    it('words the journal line reason', () => {
        expect(typeLockMessage({ lines: 3, children: 0 })).toBe(
            'This account is used on 3 journal lines, so its type cannot change. Create a new account and move the activity with a journal entry.'
        )
    })

    it('words the sub-account reason', () => {
        expect(typeLockMessage({ lines: 0, children: 2 })).toBe(
            "Sub-accounts share their parent's type. Change or move the 2 sub-accounts first."
        )
    })

    it('prefers the journal line reason when both apply', () => {
        expect(typeLockMessage({ lines: 1, children: 4 })).toContain('journal lines')
    })

    it('returns null when nothing locks the type', () => {
        expect(typeLockMessage({ lines: 0, children: 0 })).toBeNull()
    })
})

describe('inactiveRefusalMessage', () => {
    it('names the count of active sub-accounts', () => {
        expect(inactiveRefusalMessage(2)).toBe('Make the 2 active sub-accounts inactive first.')
    })
})

// The delete dialog's check before it asks the server (spec §3.11, the order of
// checkAccountDelete in server/accounts.go): the document tables of
// accountLineReferences (bill lines by account, expense lines by account, expenses by
// Paid from; each counted by distinct document) come before journal lines, which come
// before sub-accounts.
const NO_USAGE = { lines: 0, children: 0, bills: 0, expenses: 0, paidExpenses: 0 }

const DOCUMENT_TEXTS = {
    oneBill: 'This account is on 1 bill and cannot be deleted. Make it inactive instead.',
    manyBills: 'This account is on %d bills and cannot be deleted. Make it inactive instead.',
    oneExpense: 'This account is on 1 expense and cannot be deleted. Make it inactive instead.',
    manyExpenses: 'This account is on %d expenses and cannot be deleted. Make it inactive instead.',
    paidOneExpense: 'This account paid 1 expense and cannot be deleted. Make it inactive instead.',
    paidExpenses: 'This account paid %d expenses and cannot be deleted. Make it inactive instead.',
} as const

const withCount = (text: string, n: number) => text.replace('%d', String(n))

describe('deleteBlockedMessage', () => {
    it('gives nothing for an unused account', () => {
        expect(deleteBlockedMessage(NO_USAGE)).toBeNull()
    })

    it('words the journal line and sub-account reasons when no document holds the account', () => {
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 2 })).toBe(
            'This account is used on journal lines'
        )
        expect(deleteBlockedMessage({ ...NO_USAGE, children: 1 })).toBe(
            'This account has sub-accounts'
        )
    })

    it('gives the expense Paid from text before the journal lines text', () => {
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 2, paidExpenses: 1 })).toBe(
            DOCUMENT_TEXTS.paidOneExpense
        )
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 6, paidExpenses: 3 })).toBe(
            withCount(DOCUMENT_TEXTS.paidExpenses, 3)
        )
    })

    it('gives the expense line text before the journal lines text', () => {
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 1, expenses: 1 })).toBe(
            DOCUMENT_TEXTS.oneExpense
        )
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 3, expenses: 3 })).toBe(
            withCount(DOCUMENT_TEXTS.manyExpenses, 3)
        )
    })

    it('gives the bill line text before the journal lines text', () => {
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 1, bills: 1 })).toBe(
            DOCUMENT_TEXTS.oneBill
        )
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 2, bills: 2 })).toBe(
            withCount(DOCUMENT_TEXTS.manyBills, 2)
        )
    })

    it('gives a document text before the sub-account text', () => {
        expect(deleteBlockedMessage({ ...NO_USAGE, children: 2, expenses: 1 })).toBe(
            DOCUMENT_TEXTS.oneExpense
        )
    })

    it('follows the server order: bills, then expense lines, then Paid from', () => {
        expect(
            deleteBlockedMessage({ ...NO_USAGE, lines: 4, bills: 1, expenses: 2, paidExpenses: 2 })
        ).toBe(DOCUMENT_TEXTS.oneBill)
        expect(deleteBlockedMessage({ ...NO_USAGE, lines: 4, expenses: 2, paidExpenses: 1 })).toBe(
            withCount(DOCUMENT_TEXTS.manyExpenses, 2)
        )
    })
})

describe('server drift', () => {
    it.each(
        Object.entries(DOCUMENT_TEXTS)
    )('server/accounts.go holds the %s delete text', (_name, text) => {
        expect(serverSource).toContain(text)
    })

    it('server/accounts.go holds the same journal line format string', () => {
        expect(serverSource).toContain(
            'This account is used on %d journal lines, so its type cannot change. Create a new account and move the activity with a journal entry.'
        )
    })

    it('server/accounts.go holds the same sub-account format string', () => {
        expect(serverSource).toContain(
            "Sub-accounts share their parent's type. Change or move the %d sub-accounts first."
        )
    })

    it('server/accounts.go holds the same inactive format string', () => {
        expect(serverSource).toContain('Make the %d active sub-accounts inactive first.')
    })

    it('server/accounts.go holds the 1099 box text', () => {
        expect(serverSource).toContain(BOX_NEEDS_EXPENSE_TYPE_TEXT)
    })
})
