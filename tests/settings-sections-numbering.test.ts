import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS, visibleSections } from '../tinycld/books/lib/settings-sections'

describe('numbering settings section', () => {
    it('is listed as "Numbering" and is not admin only', () => {
        const numbering = SETTINGS_SECTIONS.find(s => s.id === 'numbering')
        expect(numbering).toEqual({ id: 'numbering', label: 'Numbering', adminOnly: false })
    })

    it('shows to a non-admin after Accounting', () => {
        const ids = visibleSections(false).map(s => s.id)
        expect(ids).toContain('numbering')
        expect(ids.indexOf('numbering')).toBeGreaterThan(ids.indexOf('accounting'))
    })
})
