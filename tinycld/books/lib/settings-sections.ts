import type { BooksSettings } from '../types'
import { formatDay } from './register-range'
import { FISCAL_MONTHS } from './setup-schema'

export type SectionId = 'company' | 'accounting' | 'numbering' | 'access'

export type SettingsSection = { id: SectionId; label: string; adminOnly: boolean }

export const SETTINGS_SECTIONS: SettingsSection[] = [
    { id: 'company', label: 'Company', adminOnly: false },
    { id: 'accounting', label: 'Accounting', adminOnly: false },
    { id: 'numbering', label: 'Numbering', adminOnly: false },
]

export function visibleSections(isAdmin: boolean): SettingsSection[] {
    return SETTINGS_SECTIONS.filter(s => isAdmin || !s.adminOnly)
}

function accountingSummary(settings: BooksSettings | undefined): string {
    const month = FISCAL_MONTHS[(settings?.fiscal_year_start_month ?? 1) - 1] ?? FISCAL_MONTHS[0]
    const base = `Fiscal year starts in ${month}`
    const closeDate = settings?.close_date
    return closeDate ? `${base}; books closed through ${formatDay(closeDate)}` : base
}

export function sectionSummary(
    id: SectionId,
    data: { settings: BooksSettings | undefined; sequenceCount: number }
): string {
    if (id === 'company') return data.settings?.business_name || 'Name your business'
    if (id === 'accounting') return accountingSummary(data.settings)
    if (id === 'numbering') {
        return data.sequenceCount === 1 ? '1 document type' : `${data.sequenceCount} document types`
    }
    return 'Who can open Books'
}
