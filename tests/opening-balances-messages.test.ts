import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    alreadyEnteredMessage,
    onlyOpeningScreenMessage,
} from '../tinycld/books/lib/opening-balances-messages'

const openingSource = readFileSync(join(__dirname, '..', 'server', 'opening_balances.go'), 'utf8')
const reversalSource = readFileSync(join(__dirname, '..', 'server', 'reversal.go'), 'utf8')

const alreadyEnteredFormat = 'Opening balances are already entered (%s). Edit that entry.'

describe('server drift', () => {
    it('server/opening_balances.go holds the already-entered format string', () => {
        expect(openingSource).toContain(`"${alreadyEnteredFormat}"`)
    })

    it('alreadyEnteredMessage fills the number into that format', () => {
        expect(alreadyEnteredMessage('JE-1046')).toBe(alreadyEnteredFormat.replace('%s', 'JE-1046'))
    })

    it('server/reversal.go holds the only-opening-screen message', () => {
        expect(onlyOpeningScreenMessage).not.toBe('')
        expect(reversalSource).toContain(onlyOpeningScreenMessage)
    })
})
