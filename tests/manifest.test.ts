// @vitest-environment happy-dom
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'
import pkg from '../package.json'

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

    it('declares the accounting setup step', () => {
        expect(manifest.setupSteps).toContainEqual({
            id: 'accounting',
            label: 'Accounting',
            module: 'setup/accounting',
            order: 'a1V',
        })
    })

    it('resolves the setup step module through package.json exports to a component', async () => {
        const step = manifest.setupSteps.find(s => s.id === 'accounting')
        const subpath = `./${step?.module}`
        const exportsMap: Record<string, string> = pkg.exports
        const key = Object.keys(exportsMap).find(
            k => k.endsWith('/*') && subpath.startsWith(k.slice(0, -1))
        )
        expect(key).toBeDefined()
        const wildcard = subpath.slice((key as string).length - 1)
        const target = exportsMap[key as string].replace('*', wildcard)
        const file = join(__dirname, '..', target)
        expect(existsSync(file)).toBe(true)
        const loaded = await import(file)
        expect(typeof loaded.default).toBe('function')
    })

    it('declares the forms host modules, each resolved through package.json exports', () => {
        expect(manifest.forms).toEqual({ hosts: 'forms', ui: 'forms-ui' })
        const exportsMap: Record<string, string> = pkg.exports
        const targets = {
            hosts: './tinycld/books/forms/hosts.ts',
            ui: './tinycld/books/forms/ui.ts',
        }
        for (const [part, target] of Object.entries(targets)) {
            const subpath = `./${manifest.forms[part as keyof typeof targets]}`
            expect(exportsMap[subpath]).toBe(target)
            expect(existsSync(join(__dirname, '..', exportsMap[subpath]))).toBe(true)
        }
    })
})
