import type { BooksAccounts, BooksSettings } from '../types'
import { formatMoney } from './money'
import { formatDay } from './register-range'
import { FISCAL_MONTHS } from './setup-schema'

export type SectionId = 'company' | 'accounting' | 'numbering' | 'form-1099' | 'access'

export type SettingsSection = { id: SectionId; label: string; adminOnly: boolean }

export const SETTINGS_SECTIONS: SettingsSection[] = [
    { id: 'company', label: 'Company', adminOnly: false },
    { id: 'accounting', label: 'Accounting', adminOnly: false },
    { id: 'numbering', label: 'Numbering', adminOnly: false },
    { id: 'form-1099', label: '1099s', adminOnly: false },
    { id: 'access', label: 'Access', adminOnly: true },
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

function mappedText(count: number): string {
    if (count === 0) return 'No accounts mapped'
    return count === 1 ? '1 account mapped' : `${count} accounts mapped`
}

// The Settings section-list line. Without the accounts (still loading or failed), the
// threshold stands alone rather than claiming a count.
export function form1099Summary(
    settings: Pick<BooksSettings, 'threshold_1099' | 'currency'> | undefined,
    accounts: readonly Pick<BooksAccounts, 'form_1099_box'>[] | undefined
): string {
    if (!settings) return '1099 threshold and accounts'
    const threshold = `Threshold ${formatMoney(settings.threshold_1099, settings.currency)}`
    if (!accounts) return threshold
    const mapped = accounts.filter(account => account.form_1099_box !== '').length
    return `${threshold} · ${mappedText(mapped)}`
}

export function sectionSummary(
    id: SectionId,
    data: {
        settings: BooksSettings | undefined
        sequenceCount: number
        accounts1099?: readonly Pick<BooksAccounts, 'form_1099_box'>[]
    }
): string {
    if (id === 'company') return data.settings?.business_name || 'Name your business'
    if (id === 'accounting') return accountingSummary(data.settings)
    if (id === 'numbering') {
        return data.sequenceCount === 1 ? '1 document type' : `${data.sequenceCount} document types`
    }
    if (id === 'form-1099') return form1099Summary(data.settings, data.accounts1099)
    return 'Who can open Books'
}
