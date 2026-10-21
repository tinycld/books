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
})
