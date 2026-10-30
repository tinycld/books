import { useTrialBalance } from '../../hooks/useTrialBalance'
import type { ReportDefinition } from '../report-definition'
import { AS_OF_PRESET_IDS } from '../report-period'

export const TRIAL_BALANCE: ReportDefinition = {
    id: 'trial-balance',
    title: 'Trial Balance',
    period: { kind: 'as-of', presets: AS_OF_PRESET_IDS, defaultPreset: 'end-of-last-month' },
    hasBasis: false,
    rowsChoice: { default: 'non-zero' },
    filters: [{ id: 'account', label: 'Account', kind: 'accounts' }],
    useReport: useTrialBalance,
}
