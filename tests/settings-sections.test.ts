import { describe, expect, it } from 'vitest'
import { COMPANY_SETTINGS, EMPTY_SETTINGS } from '../tinycld/books/lib/books-settings-fixture'
import {
    form1099Summary,
    SETTINGS_SECTIONS,
    sectionSummary,
    visibleSections,
} from '../tinycld/books/lib/settings-sections'
import { ACCOUNTS_1099, NO_EXPENSE_ACCOUNTS_1099 } from '../tinycld/books/lib/vendor-1099-fixture'

describe('visibleSections', () => {
    it('hides admin-only sections from a non-admin', () => {
        expect(visibleSections(false).some(s => s.adminOnly)).toBe(false)
        expect(visibleSections(false).map(s => s.id)).toContain('company')
    })

    it('shows every section to an admin in order', () => {
        expect(visibleSections(true)).toEqual(SETTINGS_SECTIONS)
    })

    it('shows the 1099s section to a non-admin, after Numbering', () => {
        expect(visibleSections(false).map(s => s.id)).toEqual([
            'company',
            'accounting',
            'numbering',
            'form-1099',
        ])
    })
})

describe('SETTINGS_SECTIONS', () => {
    it('puts 1099s between Numbering and Access', () => {
        expect(SETTINGS_SECTIONS.map(s => s.id)).toEqual([
            'company',
            'accounting',
            'numbering',
            'form-1099',
            'access',
        ])
    })

    it('labels the 1099s entry 1099s and does not limit it to admins', () => {
        expect(SETTINGS_SECTIONS.find(s => s.id === 'form-1099')).toEqual({
            id: 'form-1099',
            label: '1099s',
            adminOnly: false,
        })
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

    it('summarises 1099s by the threshold and the mapped accounts', () => {
        const summary = sectionSummary('form-1099', {
            settings: COMPANY_SETTINGS,
            sequenceCount: 1,
            accounts1099: [{ form_1099_box: 'nec_1' }, { form_1099_box: '' }],
        })
        expect(summary.endsWith('· 1 account mapped')).toBe(true)
        expect(summary).toBe('Threshold $2,000.00 · 1 account mapped')
    })
})

describe('form1099Summary', () => {
    const usd = { threshold_1099: 200000, currency: 'USD' }

    it('reads the threshold and counts the mapped accounts', () => {
        expect(form1099Summary(usd, ACCOUNTS_1099)).toBe('Threshold $2,000.00 · 3 accounts mapped')
    })

    it('says 1 account mapped for one mapped row', () => {
        const oneMapped = ACCOUNTS_1099.filter(
            account => account.form_1099_box === '' || account.number === '6100'
        )
        expect(oneMapped.filter(account => account.form_1099_box !== '')).toHaveLength(1)
        expect(form1099Summary(usd, oneMapped)).toBe('Threshold $2,000.00 · 1 account mapped')
    })

    it('says No accounts mapped when no row has a box', () => {
        expect(form1099Summary(usd, NO_EXPENSE_ACCOUNTS_1099)).toBe(
            'Threshold $2,000.00 · No accounts mapped'
        )
        expect(form1099Summary(usd, [])).toBe('Threshold $2,000.00 · No accounts mapped')
    })

    it('shows the threshold alone while the accounts are not known', () => {
        expect(form1099Summary(usd, undefined)).toBe('Threshold $2,000.00')
    })

    it('names the section without settings', () => {
        expect(form1099Summary(undefined, ACCOUNTS_1099)).toBe('1099 threshold and accounts')
    })

    it('prints the threshold in the book currency', () => {
        expect(form1099Summary({ threshold_1099: 200000, currency: 'EUR' }, [])).toBe(
            'Threshold €2,000.00 · No accounts mapped'
        )
    })
})
