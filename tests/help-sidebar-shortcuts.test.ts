import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'
import { DEFAULT_SHORTCUTS, MAX_SHORTCUTS } from '../tinycld/books/lib/sidebar-shortcuts'
import { paragraphWith, readHelpTopic, sectionOf } from './help-topic'

const topic = readHelpTopic('sidebar-shortcuts')

describe('help/sidebar-shortcuts.md', () => {
    it('is a topic of the Books help directory with a title and a summary', () => {
        expect(manifest.help.directory).toBe('help')
        expect(topic.exists).toBe(true)
        expect(topic.frontmatter).toMatch(/^title:\s*\S+/m)
        expect(topic.frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('names the default shortcuts, as many as the app gives', () => {
        const line = paragraphWith(topic.body, /At first the list holds/) ?? ''
        for (const name of ['Customers', 'Vendors', 'Products and services']) {
            expect(line).toContain(name)
        }
        expect(line).toContain('Profit and Loss')
        expect(line).toContain('Balance Sheet')
        expect(DEFAULT_SHORTCUTS).toHaveLength(5)
    })

    it('says how to add, remove, reorder, reset and save', () => {
        const section = sectionOf(topic.body, 'Shortcuts')
        expect(section).toContain('Customize shortcuts')
        expect(section).toContain('Add shortcut')
        expect(section).toMatch(/To remove a shortcut,/)
        expect(section).toMatch(/drag a row by its handle, or press the up and down arrows/)
        expect(section).toContain('Reset to defaults')
        expect(section).toMatch(/Press Save to keep your changes/)
    })

    it('states the limit the app holds', () => {
        expect(topic.body).toContain(`at most ${MAX_SHORTCUTS} shortcuts`)
    })

    it('says the list is per person, and what a reader and a missing target get', () => {
        const section = sectionOf(topic.body, 'Shortcuts')
        expect(section).toMatch(/each person has their own/)
        expect(section).toMatch(/read-only access, Add shortcut offers no forms/)
        expect(section).toContain('Not available')
    })

    it('covers New on a wide screen and on a phone, and for a reader', () => {
        const section = sectionOf(topic.body, 'New')
        expect(section).toMatch(/Customers, Vendors or Other/)
        expect(section).toMatch(/round \+ button/)
        expect(section).toMatch(/read-only access, New and the round \+ button are hidden/)
    })

    it('covers the Reports part: reports open inside Books, All reports opens Reports', () => {
        const section = sectionOf(topic.body, 'Reports')
        expect(section).toMatch(/opens inside Books/)
        expect(section).toContain('All reports')
        expect(section).toMatch(/back link, Books shows the list of the Books reports/)
        expect(section).toContain('(help://books:reports)')
    })

    it('says the phone sidebar is the Books menu', () => {
        expect(topic.body).toMatch(/On a phone, the sidebar is the Books menu/)
    })
})

describe('docs/specs/books-shell-design.md decisions', () => {
    const spec = readFileSync(resolve(__dirname, '../docs/specs/books-shell-design.md'), 'utf8')

    it('records that a stored screen:reports shortcut draws no row', () => {
        expect(spec).toMatch(/`screen:reports`[^\n]*draws no row[^\n]*Not available/)
    })

    it('records why core settings panels draw SectionPanelScreen', () => {
        expect(spec).toMatch(/no scroller[^\n]*`SectionPanelScreen`[^\n]*`ScrollView`/)
    })
})

describe('the topics that point at the sidebar', () => {
    it('navigating-books links the shortcuts topic and names the Reports part and All reports', () => {
        const { body } = readHelpTopic('navigating-books')
        expect(body).toContain('(help://books:sidebar-shortcuts)')
        expect(body).toMatch(/open Reports in the sidebar and press the report/)
        expect(body).toContain('All reports')
        expect(body).not.toContain('choose Reports in the sidebar: it opens Reports')
    })

    it('reports says a report opens inside Books and All reports opens the full list', () => {
        const { body } = readHelpTopic('reports')
        expect(body).toMatch(/The report opens inside Books/)
        expect(body).toMatch(/press All reports at the end of the list/)
        expect(body).toContain('(help://books:sidebar-shortcuts)')
    })

    it('settings names both places the sections open from', () => {
        const { body } = readHelpTopic('settings')
        const line = paragraphWith(body, /Books settings open from two places/) ?? ''
        expect(line).toMatch(/Settings in the Books sidebar/)
        expect(line).toMatch(/the Books group of the app's Settings/)
        expect(line).toMatch(/organization owner or admin/)
    })
})
