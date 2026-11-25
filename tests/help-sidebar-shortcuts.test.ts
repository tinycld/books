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
        expect(section).toMatch(/A line separates the customer actions, the vendor actions/)
        expect(section).not.toMatch(/Customers, Vendors or Other/)
        expect(section).toMatch(/round \+ button: the Books menu opens with New open, at the top/)
        expect(section).toMatch(/read-only access, New and the round \+ button are hidden/)
    })

    it('covers the Reports part: reports open inside Books, All reports opens Reports', () => {
        const section = sectionOf(topic.body, 'Reports')
        expect(section).toMatch(/opens inside Books/)
        expect(section).toContain('All reports')
        expect(section).toMatch(/back link, Books shows the list of the Books reports/)
        expect(section).toContain('(help://books:reports)')
        expect(section).toMatch(/overview, sales, expenses and accounting/)
    })

    it('names the filter box and the fixed screens, with no Go to part', () => {
        expect(topic.body).toContain('Find in menu')
        expect(sectionOf(topic.body, 'The fixed screens')).toMatch(/Chart of Accounts/)
        expect(topic.body).not.toMatch(/## Go to/)
    })

    it('says the phone sidebar is the Books menu', () => {
        expect(topic.body).toMatch(/On a phone, the sidebar is the Books menu/)
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

    it('reports says where Books reports open and where their back link goes', () => {
        const { body } = readHelpTopic('reports')
        expect(body).not.toContain('Reports area')
        expect(body).toMatch(/^Books reports, such as the Trial Balance, open inside Books/m)
        const back = paragraphWith(body, /^To go back, press Reports at the top/) ?? ''
        expect(back).toMatch(/returns to the screen that you opened the report from/)
        expect(back).toMatch(/from a link, it shows the list of the Books reports/)
        expect(back).toMatch(/press All reports in the Books sidebar, then press Show all reports/)
    })

    it('settings names both places the sections open from', () => {
        const { body } = readHelpTopic('settings')
        const line = paragraphWith(body, /Books settings open from two places/) ?? ''
        expect(line).toMatch(/Settings in the Books sidebar/)
        expect(line).toMatch(/the Books group of the app's Settings/)
        expect(line).toMatch(/organization owner or admin/)
    })
})
