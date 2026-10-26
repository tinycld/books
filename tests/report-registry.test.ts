import { describe, expect, it, vi } from 'vitest'
import {
    hasAvailableReport,
    hubSections,
    REPORT_ENTRIES,
    REPORT_SECTIONS,
    type ReportEntry,
    reportEntry,
} from '../tinycld/books/lib/report-registry'
import {
    HUB_ENTRIES,
    HUB_ENTRIES_NONE,
    HUB_ENTRIES_V0,
} from '../tinycld/books/lib/report-shell-fixture'
import { definedReportIds, reportDefinition } from '../tinycld/books/lib/reports/definitions'

// The definitions import the data hooks that read the collections.
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})

describe('REPORT_SECTIONS', () => {
    it('lists the seven hub sections in order', () => {
        expect(REPORT_SECTIONS.map(section => section.title)).toEqual([
            'Business overview',
            'For my accountant',
            'Who owes you',
            'What you owe',
            'Sales and customers',
            'Expenses and vendors',
            'Taxes',
        ])
    })
})

describe('REPORT_ENTRIES', () => {
    const sectionIds = new Set<string>(REPORT_SECTIONS.map(section => section.id))
    const ids = REPORT_ENTRIES.map(entry => entry.id)

    it('the Trial Balance is the only available entry', () => {
        expect(REPORT_ENTRIES.filter(entry => entry.available).map(entry => entry.id)).toEqual([
            'trial-balance',
        ])
    })

    it('ids are unique and kebab-case', () => {
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.filter(id => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([])
    })

    it('every entry has a title, a description and a known section', () => {
        const bad = REPORT_ENTRIES.filter(
            entry =>
                entry.title.trim() === '' ||
                entry.description.trim() === '' ||
                !sectionIds.has(entry.section)
        ).map(entry => entry.id)
        expect(bad).toEqual([])
    })

    it('includes the Trial Balance, Profit and Loss and Balance Sheet', () => {
        expect(ids).toEqual(
            expect.arrayContaining(['trial-balance', 'profit-and-loss', 'balance-sheet'])
        )
    })
})

describe('hubSections', () => {
    it('keeps the sections that have an available entry, in registry order', () => {
        const sections = hubSections(HUB_ENTRIES)
        expect(sections.map(section => section.id)).toEqual([
            'business-overview',
            'accountant',
            'who-owes-you',
            'what-you-owe',
            'sales',
            'expenses',
        ])
        expect(sections.map(section => section.id)).not.toContain('taxes')
    })

    it('lists only the available entries of a section, in registry order', () => {
        const accountant = hubSections(HUB_ENTRIES).find(section => section.id === 'accountant')
        expect(accountant?.title).toBe('For my accountant')
        expect(accountant?.entries.map(entry => entry.title)).toEqual([
            'Trial Balance',
            'General Ledger',
        ])
    })

    it('is empty when no entry is available', () => {
        expect(hubSections(HUB_ENTRIES_NONE)).toEqual([])
    })

    it('returns sections in registry order when the entries come out of section order', () => {
        const entries: ReportEntry[] = [
            {
                id: 'expenses-by-vendor',
                title: 'Expenses by vendor',
                description: 'Spending per vendor for a period',
                section: 'expenses',
                available: true,
            },
            {
                id: 'trial-balance',
                title: 'Trial Balance',
                description: 'Debit and credit balance of every account on a date',
                section: 'accountant',
                available: true,
            },
            {
                id: 'profit-and-loss',
                title: 'Profit and Loss',
                description: 'Income, expenses and net income for a period',
                section: 'business-overview',
                available: true,
            },
        ]
        const sections = hubSections(entries)
        expect(sections.map(section => section.id)).toEqual([
            'business-overview',
            'accountant',
            'expenses',
        ])
        expect(sections.map(section => section.entries.map(entry => entry.id))).toEqual([
            ['profit-and-loss'],
            ['trial-balance'],
            ['expenses-by-vendor'],
        ])
    })

    it('the v0 registry is one section, accountant, with only the Trial Balance', () => {
        const sections = hubSections(HUB_ENTRIES_V0)
        expect(sections.map(section => section.id)).toEqual(['accountant'])
        expect(sections[0]?.entries.map(entry => entry.id)).toEqual(['trial-balance'])
    })
})

describe('reportEntry and hasAvailableReport', () => {
    it('finds the Trial Balance entry by id', () => {
        expect(reportEntry('trial-balance')).toMatchObject({
            id: 'trial-balance',
            title: 'Trial Balance',
            section: 'accountant',
        })
    })

    it('returns undefined for an unknown id', () => {
        expect(reportEntry('nope')).toBeUndefined()
    })

    it('the shipped registry has an available report', () => {
        expect(hasAvailableReport(REPORT_ENTRIES)).toBe(true)
    })

    it('the v0 fixture has an available report', () => {
        expect(hasAvailableReport(HUB_ENTRIES_V0)).toBe(true)
    })
})

describe('registry and definitions agree', () => {
    it('every available entry has a definition with its id and title', () => {
        const available = REPORT_ENTRIES.filter(entry => entry.available)
        expect(available.length).toBeGreaterThan(0)
        const mismatched = available
            .map(entry => {
                const definition = reportDefinition(entry.id)
                return {
                    id: entry.id,
                    definitionId: definition?.id,
                    title: entry.title,
                    definitionTitle: definition?.title,
                }
            })
            .filter(row => row.definitionId !== row.id || row.definitionTitle !== row.title)
        expect(mismatched).toEqual([])
    })

    it('every defined report id is a registry id', () => {
        const registryIds = new Set(REPORT_ENTRIES.map(entry => entry.id))
        expect(definedReportIds().filter(id => !registryIds.has(id))).toEqual([])
    })

    it('serves no definition for an unavailable registry id or an unknown id', () => {
        expect(reportEntry('profit-and-loss')?.available).toBe(false)
        expect(reportDefinition('profit-and-loss')).toBeUndefined()
        expect(reportDefinition('no-such-report')).toBeUndefined()
    })
})
