import type {
    FilterSpec,
    PeriodPreset,
    ReportModel,
    ReportOptions,
    ReportPeriod,
    ReportSpec,
} from './report-definition'
import { hasActiveFilters, inactiveFilters } from './report-filters'
import { dayWords, periodWords } from './report-period'

export type ReportViewState = 'loading' | 'error' | 'empty' | 'ready'

export function reportViewState(input: {
    isError: boolean
    isReady: boolean
    rowCount: number
}): ReportViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    return input.rowCount === 0 ? 'empty' : 'ready'
}

// Section, subtotal and total rows are drawn from the detail rows, so a model with no detail
// row is empty even when its total row reads zero.
export function detailRowCount(model: ReportModel | undefined): number {
    return model?.rows.filter(row => row.kind === 'detail').length ?? 0
}

export function emptyMessage(period: ReportPeriod): string {
    if (period.kind === 'as-of') return `No balances as of ${dayWords(period.to)}`
    return `No activity for ${periodWords(period)}`
}

export type EmptyAction =
    | { kind: 'clear-filters'; label: string }
    | { kind: 'preset'; preset: PeriodPreset; label: string }

const SHOW_THIS_FISCAL_YEAR = 'Show this fiscal year'
const SHOW_END_OF_LAST_FISCAL_YEAR = 'Show end of last fiscal year'

// The wider period most likely to have figures: offered only when the report lists it and
// is not already on it.
function widerPeriodAction(spec: ReportSpec, options: ReportOptions): EmptyAction | null {
    const current = options.period.preset
    if (spec.period.kind === 'range') {
        const target = spec.period.presets.find(preset => preset === 'this-fiscal-year')
        if (!target || current === target) return null
        return { kind: 'preset', preset: target, label: SHOW_THIS_FISCAL_YEAR }
    }
    const target = spec.period.presets.find(preset => preset === 'end-of-last-fiscal-year')
    if (!target || current === target) return null
    return { kind: 'preset', preset: target, label: SHOW_END_OF_LAST_FISCAL_YEAR }
}

export function emptyAction(spec: ReportSpec, options: ReportOptions): EmptyAction | null {
    if (hasActiveFilters(options.filters)) return { kind: 'clear-filters', label: 'Clear filters' }
    return widerPeriodAction(spec, options)
}

export type ControlRowItem =
    | { kind: 'period' }
    | { kind: 'method' }
    | { kind: 'filter'; filter: FilterSpec }
    | { kind: 'add-filter' }

export function controlRowItems(spec: ReportSpec, options: ReportOptions): ControlRowItem[] {
    const specs = spec.filters ?? []
    const items: ControlRowItem[] = [{ kind: 'period' }]
    if (spec.hasBasis) items.push({ kind: 'method' })
    for (const filter of specs) {
        if (options.filters[filter.id]?.length) items.push({ kind: 'filter', filter })
    }
    if (inactiveFilters(specs, options.filters).length > 0) items.push({ kind: 'add-filter' })
    return items
}

export type CustomizeSection = 'number-format' | 'rows' | 'columns'

export function customizeSections(spec: ReportSpec): CustomizeSection[] {
    const sections: CustomizeSection[] = ['number-format']
    if (spec.rowsChoice) sections.push('rows')
    if (spec.columnsBy || spec.columnToggles?.length) sections.push('columns')
    return sections
}
