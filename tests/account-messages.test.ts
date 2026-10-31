import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    BOX_NEEDS_EXPENSE_TYPE,
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

describe('server drift', () => {
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
