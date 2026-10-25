import { describe, expect, it } from 'vitest'
import { COMPANY_SETTINGS, EMPTY_SETTINGS } from '../tinycld/books/lib/books-settings-fixture'
import {
    SETTINGS_SECTIONS,
    sectionSummary,
    visibleSections,
} from '../tinycld/books/lib/settings-sections'

describe('visibleSections', () => {
    it('hides admin-only sections from a non-admin', () => {
        expect(visibleSections(false).some(s => s.adminOnly)).toBe(false)
        expect(visibleSections(false).map(s => s.id)).toContain('company')
    })

    it('shows every section to an admin in order', () => {
        expect(visibleSections(true)).toEqual(SETTINGS_SECTIONS)
    })
})

describe('sectionSummary', () => {
    const data = (settings: typeof COMPANY_SETTINGS | undefined) => ({
        settings,
        sequenceCount: 1,
    })

    it('reads the fiscal year start month', () => {
        const jan = { ...EMPTY_SETTINGS, fiscal_year_start_month: 1 }
        const jul = { ...EMPTY_SETTINGS, fiscal_year_start_month: 7 }
        expect(sectionSummary('accounting', data(jan))).toBe('Fiscal year starts in January')
        expect(sectionSummary('accounting', data(jul))).toBe('Fiscal year starts in July')
    })

    it('appends the close date clause when set', () => {
        expect(sectionSummary('accounting', data(COMPANY_SETTINGS))).toBe(
            'Fiscal year starts in January; books closed through Sep 30, 2026'
        )
    })

    it('summarises the company by name or a prompt', () => {
        expect(sectionSummary('company', data(COMPANY_SETTINGS))).toBe('Hartwell Supply Co.')
        expect(sectionSummary('company', data({ ...COMPANY_SETTINGS, business_name: '' }))).toBe(
            'Name your business'
        )
    })
})
