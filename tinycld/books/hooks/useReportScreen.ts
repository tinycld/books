import { type Breakpoint, useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { useLocalSearchParams } from 'expo-router'
import type { UseFormReturn } from 'react-hook-form'
import { fiscalStartMonth, todayIso } from '../lib/register-range'
import type {
    FilterSpec,
    LiveRecovery,
    ReportDefinition,
    ReportModel,
    ReportModelRow,
    ReportOptions,
} from '../lib/report-definition'
import {
    filterChipValue,
    filterPickerSchema,
    inactiveFilters,
    pickerRows,
    shownAccountValues,
    withoutFilter,
} from '../lib/report-filters'
import { parseReportParams } from '../lib/report-options'
import { type PeriodContext, periodChipLabel, periodWords } from '../lib/report-period'
import { foldAllLabel, foldAllTarget } from '../lib/report-rows'
import {
    type ControlRowItem,
    controlRowItems,
    detailRowCount,
    type EmptyAction,
    emptyAction,
    emptyMessage,
    mergeRecoveries,
    type ReportViewState,
    reportViewState,
} from '../lib/report-state'
import { type ReportSurface, useReportUIStore } from '../stores/report-ui-store'
import { type AccountChoice, useAccountOptions } from './useAccountOptions'
import { useBackToReports } from './useBackToReports'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { type ReportOptionsForm, useReportOptionsForm } from './useReportOptionsForm'

const DEFAULT_CURRENCY = 'USD'

// Module-level, so a report with nothing folded hands the table the same array each render.
const NOTHING_FOLDED: string[] = []
const NO_ROWS: ReportModelRow[] = []

type PickerDraftValues = { values: string[] }

function chipValuesOf(
    specs: readonly FilterSpec[],
    filters: Record<string, string[]>,
    names: ReadonlyMap<string, string>
): Record<string, string> {
    const values: Record<string, string> = {}
    for (const spec of specs) {
        const active = filters[spec.id]
        if (active?.length) values[spec.id] = filterChipValue(spec, active, names)
    }
    return values
}

export type ReportPrerequisites = {
    state: 'loading' | 'error' | 'no-access' | 'ready'
    context: PeriodContext | null
    businessName: string
    currency: string
    recovery: LiveRecovery
    onRetry(): void
}

function prerequisiteState(
    access: { isReady: boolean; isError: boolean; canRead: boolean },
    settings: { isReady: boolean; hasLoadError: boolean }
): ReportPrerequisites['state'] {
    if (settings.hasLoadError || access.isError) return 'error'
    if (!access.isReady || !settings.isReady) return 'loading'
    if (!access.canRead) return 'no-access'
    return 'ready'
}

// The presets resolve from the fiscal year start month, so the report waits for Books
// access and settings before it reads a single figure.
export function useReportPrerequisites(): ReportPrerequisites {
    const access = useBooksAccess()
    const booksSettings = useBooksSettings()
    const [accessCollection] = useStore('books_access')
    const { settings } = booksSettings
    const state = prerequisiteState(access, booksSettings)
    const context =
        state === 'ready'
            ? { today: todayIso(), fiscalStartMonth: fiscalStartMonth(settings) }
            : null

    // Only what failed is rebuilt, so a healthy query every Books screen reads is left alone.
    const accessRecovery = access.isError
        ? { queries: [access.collection], sources: [accessCollection] }
        : { queries: [], sources: [] }
    const recovery = mergeRecoveries([booksSettings.recovery, accessRecovery])
    const onRetry = () => {
        void recoverLiveQueries({ ...recovery, onError: err => log.error('books.report', err) })
    }

    return {
        state,
        context,
        businessName: settings?.business_name ?? '',
        currency: settings?.currency || DEFAULT_CURRENCY,
        recovery,
        onRetry,
    }
}

export type ReportScreenModel = {
    definition: ReportDefinition
    options: ReportOptions
    state: ReportViewState
    model: ReportModel | undefined
    currency: string
    businessName: string
    periodWords: string
    periodChipLabel: string
    emptyMessage: string
    emptyAction: EmptyAction | null
    controlItems: ControlRowItem[]
    chipValues: Record<string, string>
    addableFilters: FilterSpec[]
    accountChoices: AccountChoice[]
    accountNames: ReadonlyMap<string, string>
    accountPickerRows: AccountChoice[]
    pickerDraft: UseFormReturn<PickerDraftValues>
    form: ReportOptionsForm
    surface: ReportSurface | null
    onOpenSurface(surface: ReportSurface): void
    onCloseSurface(): void
    onCloseSurfaceOf(kind: ReportSurface['kind']): void
    onApplyFilter(filterId: string, values: string[]): void
    onRemoveFilter(filterId: string): void
    onEmptyAction(): void
    onRetry(): void
    onBack(): void
    breakpoint: Breakpoint
    folded: string[]
    foldAllLabel: 'Collapse all' | 'Expand all' | null
    onFoldAll(): void
    onToggleSection(sectionId: string): void
}

export function useReportScreen(input: {
    definition: ReportDefinition
    context: PeriodContext
    prerequisites: ReportPrerequisites
}): ReportScreenModel {
    const { definition, context, prerequisites } = input
    const params = useLocalSearchParams()
    const options = parseReportParams(definition, params, context)
    const result = definition.useReport(options)
    const onBack = useBackToReports()
    const breakpoint = useBreakpoint()
    const action = emptyAction(definition, options)
    const form = useReportOptionsForm({ definition, options, context })
    const accounts = useAccountOptions()
    const surface = useReportUIStore(s => s.surface)
    const openSurface = useReportUIStore(s => s.openSurface)
    const onCloseSurface = useReportUIStore(s => s.closeSurface)
    const onCloseSurfaceOf = useReportUIStore(s => s.closeSurfaceOf)
    const folded = useReportUIStore(s => s.folded[definition.id]) ?? NOTHING_FOLDED
    const setFolded = useReportUIStore(s => s.setFolded)
    const toggleSection = useReportUIStore(s => s.toggleSection)
    const rows = result.model?.rows ?? NO_ROWS
    const filterSpecs = definition.filters ?? []
    const accountChoices = accounts.options.map(o => ({ value: o.value, label: o.label.trim() }))

    // Owned here, above the Popover, so the draft survives the Popover becoming a Sheet at a
    // breakpoint change.
    const pickerDraft = useForm<PickerDraftValues>({
        resolver: zodResolver(filterPickerSchema),
        mode: 'onChange',
        defaultValues: { values: [] },
    })
    const draftValues = useWatch({ control: pickerDraft.control, name: 'values' })

    // The rows of the open picker come from the applied filter and the draft together: an
    // account that goes inactive after it is checked keeps its row, and so does an applied
    // inactive account after it is unchecked, so the user can check it again.
    const openFilterId = surface?.kind === 'filter-picker' ? surface.filterId : null
    const appliedValues = openFilterId ? (options.filters[openFilterId] ?? []) : []
    const accountPickerRows = pickerRows(
        accountChoices,
        [...appliedValues, ...draftValues],
        accounts.names
    )

    // Both the draft at open and the values at Apply pass through here. The rows come from the
    // values being kept, not the applied filter, so a group, an offered account, or any named
    // account (active or inactive) is kept, and only a nameless id is dropped. These are the
    // named values that get a row in accountPickerRows, so the two agree. An account the user
    // checked while active and that went inactive before Apply is still applied. A nameless id
    // kept while the names load stays in the open draft with no row, and is dropped at the
    // next Apply or open after the accounts are known. An inactive account that was never
    // applied leaves the list when the user unchecks it, and nothing hidden is applied.
    const keptFilterValues = (filterId: string, values: readonly string[]) => {
        const spec = filterSpecs.find(filter => filter.id === filterId)
        if (spec?.kind !== 'accounts') return [...values]
        const rows = pickerRows(accountChoices, values, accounts.names)
        return shownAccountValues(values, rows, accounts.isReady && !accounts.isError)
    }

    // Each open drafts from the applied filter, so a close without Apply changes nothing. In
    // this handler, not an effect watching the surface.
    const onOpenSurface = (next: ReportSurface) => {
        if (next.kind === 'filter-picker') {
            const selected = options.filters[next.filterId] ?? []
            pickerDraft.reset({ values: keptFilterValues(next.filterId, selected) })
            // reset() leaves isValid as it was, so Apply would follow the previous draft.
            void pickerDraft.trigger()
        }
        openSurface(next)
    }

    // Through the form, so what the user edits next starts from the options shown.
    const onEmptyAction = () => {
        if (action?.kind === 'clear-filters') form.applyFilters({})
        if (action?.kind === 'preset') form.onPreset(action.preset)
    }
    const onApplyFilter = (filterId: string, values: string[]) => {
        form.applyFilters({ ...options.filters, [filterId]: keptFilterValues(filterId, values) })
        onCloseSurface()
    }
    // No picker stays open for a filter that is gone.
    const onRemoveFilter = (filterId: string) => {
        form.applyFilters(withoutFilter(options.filters, filterId))
        if (surface?.kind === 'filter-picker' && surface.filterId === filterId) onCloseSurface()
    }
    const onFoldAll = () => setFolded(definition.id, foldAllTarget(rows, folded))
    const onToggleSection = (sectionId: string) => toggleSection(definition.id, sectionId)

    // One call over everything that failed: a source two failed queries share is cleaned once,
    // before any query loads again. Each recovery lists only what failed, so a healthy query
    // is never rebuilt.
    const onRetry = () => {
        const recovery = mergeRecoveries([
            prerequisites.recovery,
            accounts.recovery,
            result.recovery,
        ])
        void recoverLiveQueries({ ...recovery, onError: err => log.error('books.report', err) })
    }

    return {
        definition,
        options,
        state: reportViewState({
            isError: result.state === 'error' || accounts.isError,
            isReady: result.state === 'ready',
            rowCount: detailRowCount(result.model),
        }),
        model: result.model,
        currency: prerequisites.currency,
        businessName: prerequisites.businessName,
        periodWords: periodWords(options.period),
        periodChipLabel: periodChipLabel(options.period),
        emptyMessage: emptyMessage(options.period),
        emptyAction: action,
        controlItems: controlRowItems(definition, options),
        chipValues: chipValuesOf(filterSpecs, options.filters, accounts.names),
        addableFilters: inactiveFilters(filterSpecs, options.filters),
        accountChoices,
        accountNames: accounts.names,
        accountPickerRows,
        pickerDraft,
        form,
        surface,
        onOpenSurface,
        onCloseSurface,
        onCloseSurfaceOf,
        onApplyFilter,
        onRemoveFilter,
        onEmptyAction,
        onRetry,
        onBack,
        breakpoint,
        folded,
        foldAllLabel: foldAllLabel(rows, folded),
        onFoldAll,
        onToggleSection,
    }
}
