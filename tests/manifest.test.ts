// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
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

    it('declares the record history as the report panel of books/history (core D5)', () => {
        expect(manifest.reportPanels).toEqual([
            { path: 'history', component: 'components/history/RecordHistoryPanel' },
        ])
    })

    // The read and form views' HelpIcon opens books:vendor-credits (vendor credit spec
    // §3.3): the topic is a file of the manifest's help directory, with its frontmatter.
    it('has the vendor credits help topic in its help directory', () => {
        const file = join(__dirname, '..', manifest.help.directory, 'vendor-credits.md')
        expect(existsSync(file)).toBe(true)
        const text = readFileSync(file, 'utf8')
        expect(text).toMatch(/^---\n[\s\S]*^title: Vendor credits$[\s\S]*^summary: \S.*$/m)
    })

    // Vendor refund spec §2: the two routes' screens are reached through the exports map's
    // `./screens/*` wildcard (package.json does not change).
    it('resolves the vendor refund screens through package.json exports', () => {
        const exportsMap: Record<string, string> = pkg.exports
        for (const screen of ['screens/vendor-refunds/new', 'screens/vendor-refunds/[id]']) {
            const subpath = `./${screen}`
            const key = Object.keys(exportsMap).find(
                k => k.endsWith('/*') && subpath.startsWith(k.slice(0, -1))
            )
            expect(key, screen).toBe('./screens/*')
            const wildcard = subpath.slice((key as string).length - 1)
            const target = exportsMap[key as string].replace('*', wildcard)
            expect(existsSync(join(__dirname, '..', target)), target).toBe(true)
        }
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
