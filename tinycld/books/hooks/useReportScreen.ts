import { type Breakpoint, useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router, useLocalSearchParams } from 'expo-router'
import { fiscalStartMonth, todayIso } from '../lib/register-range'
import type { ReportDefinition, ReportModel, ReportOptions } from '../lib/report-definition'
import { parseReportParams, serializeReportParams } from '../lib/report-options'
import { type PeriodContext, periodChipLabel, periodWords } from '../lib/report-period'
import {
    type ControlRowItem,
    controlRowItems,
    detailRowCount,
    type EmptyAction,
    emptyAction,
    emptyMessage,
    type ReportViewState,
    reportViewState,
} from '../lib/report-state'
import { useBackToReports } from './useBackToReports'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'

const DEFAULT_CURRENCY = 'USD'

export type ReportPrerequisites = {
    state: 'loading' | 'error' | 'no-access' | 'ready'
    context: PeriodContext | null
    businessName: string
    currency: string
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
    const onRetry = () => {
        if (booksSettings.hasLoadError) booksSettings.retryLoad()
        if (access.isError) {
            void recoverLiveQueries({
                queries: [access.collection],
                sources: [accessCollection],
                onError: err => log.error('books.report', err),
            })
        }
    }

    return {
        state,
        context,
        businessName: settings?.business_name ?? '',
        currency: settings?.currency || DEFAULT_CURRENCY,
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
    onEmptyAction(): void
    onRetry(): void
    onBack(): void
    breakpoint: Breakpoint
}

function optionsAfterEmptyAction(
    definition: ReportDefinition,
    options: ReportOptions,
    action: EmptyAction,
    context: PeriodContext
): ReportOptions {
    if (action.kind === 'clear-filters') return { ...options, filters: {} }
    const { period } = parseReportParams(definition, { preset: action.preset }, context)
    return { ...options, period }
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

    // setParams replaces the history entry, so an option change adds none.
    const onEmptyAction = () => {
        if (!action) return
        const next = optionsAfterEmptyAction(definition, options, action, context)
        router.setParams(serializeReportParams(definition, next))
    }

    return {
        definition,
        options,
        state: reportViewState({
            isError: result.state === 'error',
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
        onEmptyAction,
        onRetry: result.retry,
        onBack,
        breakpoint,
    }
}
