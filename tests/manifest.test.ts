import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'

describe('books manifest', () => {
    it('declares required identifiers', () => {
        expect(manifest.name).toBe('Books')
        expect(manifest.slug).toBe('books')
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
    })

    it('has a description', () => {
        expect(manifest.description).toBe('Double-entry bookkeeping and accounting.')
    })

    it('pins a core range and keeps the migrations directory', () => {
        expect(manifest.peerVersions).toEqual({ '@tinycld/core': '>=0.8 <1' })
        expect(existsSync(join(__dirname, '..', manifest.migrations.directory))).toBe(true)
    })
})
