import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BIN_MESSAGES, binMessage } from '../tinycld/books/lib/bin-messages'
import { INVENTORY_TEXTS } from '../tinycld/books/lib/inventory-adjust-fixture'

// Read inside the test, so a missing case file fails the drift test only.
// server/bins_test.go formats the same file, so a changed word fails one side.
function serverMessages() {
    const raw = readFileSync(
        join(__dirname, '..', 'server', 'testdata', 'bin_messages.json'),
        'utf8'
    )
    return JSON.parse(raw) as Record<string, string>
}

describe('bin messages', () => {
    it('binMessage fills the slots of the holds text', () => {
        expect(binMessage('holds', 'Aisle 3', '12', '12')).toBe(
            'Aisle 3 holds 12. Move 12 or fewer.'
        )
    })

    // Spec §8 lets a bin go below zero: a From bin at 0 or less holds none.
    it('binMessage fills the holdsNone text of a From bin that holds none', () => {
        expect(binMessage('holdsNone', 'Aisle 3')).toBe('Aisle 3 holds none of this item.')
    })

    it('BIN_MESSAGES is the server case file, key for key', () => {
        expect(BIN_MESSAGES).toEqual(serverMessages())
    })

    it('each filled text is the inventory screen text', () => {
        expect(binMessage('nameTaken', 'Aisle 3, shelf B')).toBe(INVENTORY_TEXTS.binNameTaken)
        expect(binMessage('inUse', 'Aisle 3, shelf B')).toBe(INVENTORY_TEXTS.binInUse)
        expect(binMessage('holds', 'Aisle 3, shelf B', '32', '32')).toBe(
            INVENTORY_TEXTS.moveTooMany
        )
        expect(binMessage('sameBins')).toBe('Choose two different bin locations.')
    })
})
