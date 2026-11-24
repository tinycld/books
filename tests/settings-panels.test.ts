import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'
import { SETTINGS_SECTIONS } from '../tinycld/books/lib/settings-sections'

const ROOT = resolve(__dirname, '..')

describe('Books panels in core Settings', () => {
    it('lists the sections of the Books settings screen, in the same order, with the same labels', () => {
        expect(manifest.settings.map(p => ({ slug: p.slug, label: p.label }))).toEqual(
            SETTINGS_SECTIONS.map(s => ({ slug: s.id, label: s.label }))
        )
    })

    it('names for each panel a file that draws that section', () => {
        for (const panel of manifest.settings) {
            expect(panel.component).toBe(`settings/${panel.slug}`)
            const file = resolve(ROOT, 'tinycld/books', `${panel.component}.tsx`)
            expect(existsSync(file), file).toBe(true)
            expect(readFileSync(file, 'utf8')).toContain(
                `<SectionPanelScreen section="${panel.slug}" />`
            )
        }
    })

    it('exports the panel files, so the generated settings registry can import them', () => {
        const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
        expect(pkg.exports['./settings/*']).toBe('./tinycld/books/settings/*.tsx')
    })
})
