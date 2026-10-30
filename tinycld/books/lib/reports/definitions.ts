import type { ReportDefinition } from '../report-definition'
import { type ReportEntry, reportEntry } from '../report-registry'
import { TRIAL_BALANCE } from './trial-balance'

const DEFINITIONS: Record<string, ReportDefinition> = {
    'trial-balance': TRIAL_BALANCE,
}

// A definition is served only while its registry entry is available, so a report ships
// by flipping its registry flag.
export function reportDefinition(
    id: string,
    entries?: readonly ReportEntry[]
): ReportDefinition | undefined {
    if (!reportEntry(id, entries)?.available) return undefined
    return DEFINITIONS[id]
}

export const definedReportIds = (): string[] => Object.keys(DEFINITIONS)
