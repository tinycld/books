import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_TYPES, accountTypeDef } from '../tinycld/books/lib/account-types'

describe('account types', () => {
    it('match the server list exactly', () => {
        const server = JSON.parse(
            readFileSync(join(__dirname, '..', 'server', 'account_types.json'), 'utf8')
        )
        expect(ACCOUNT_TYPES).toEqual(server)
    })

    it('look a type up by key', () => {
        expect(accountTypeDef('bank')?.label).toBe('Bank')
        expect(accountTypeDef('nope')).toBeUndefined()
    })
})
