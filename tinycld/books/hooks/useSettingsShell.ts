import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router } from 'expo-router'
import { mergeRecoveries } from '../lib/report-state'
import {
    SETTINGS_SECTIONS,
    type SectionId,
    sectionSummary,
    visibleSections,
} from '../lib/settings-sections'
import type { BooksSettings } from '../types'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useDocSequences } from './useDocSequences'
import { useExpenseGroupAccounts } from './useForm1099Section'

export type ShellPart = 'loading' | 'error' | 'list' | 'detail'

export function sectionFromParam(value: string | undefined): SectionId | undefined {
    return SETTINGS_SECTIONS.find(s => s.id === value)?.id
}

export function useSettingsShell(section: SectionId | undefined) {
    const access = useBooksAccess()
    const booksSettings = useBooksSettings()
    const docSequences = useDocSequences()
    const accounts = useExpenseGroupAccounts()
    const orgHref = useOrgHref()
    const isWide = useBreakpoint() !== 'mobile'
    const { isAdmin } = access

    const allowed = visibleSections(isAdmin)
    const requested = allowed.find(s => s.id === section)?.id
    const open = isWide ? (requested ?? 'company') : requested

    const sequences = docSequences.hasLoadError ? undefined : docSequences.sequences
    // Only the 1099s summary needs the accounts; like the sequences, their failure or a slow
    // load never blocks the shell, and the summary then shows the threshold alone.
    const accounts1099 = accounts.isReady && !accounts.isError ? accounts.rows : undefined
    const sections = allowed.map(s => ({
        id: s.id,
        label: s.label,
        summary: summaryFor(s.id, {
            settings: booksSettings.settings,
            sequenceCount: sequences?.length,
            accounts1099,
        }),
        isActive: s.id === open,
    }))

    return {
        part: shellPart({
            // Only the Numbering summary needs sequences, so their failure must not block the shell.
            isReady:
                access.isReady &&
                booksSettings.isReady &&
                (docSequences.isReady || docSequences.hasLoadError),
            // A ready query with no settings row has nothing to show, so it takes the error path.
            hasError:
                booksSettings.hasLoadError || (booksSettings.isReady && !booksSettings.settings),
            hasOpen: open !== undefined,
        }),
        sections,
        openId: open,
        isAdmin,
        // The wide rail swaps the open section in place; only a phone row enters a new screen.
        // The index and [section] routes are separate files, so navigating to the section that is
        // already open would remount the screen and drop a dirty form.
        openSection: (id: SectionId) => {
            if (id === open) return
            const href = orgHref(`books/settings/${id}`)
            if (isWide) router.replace(href)
            else router.push(href)
        },
        back: () => router.replace(orgHref('books/settings')),
        // One call over every failed query, so a retry rebuilds them together.
        retry: () => {
            void recoverLiveQueries({
                ...mergeRecoveries([
                    booksSettings.recovery,
                    docSequences.recovery,
                    accounts.recovery,
                ]),
                onError: error => log.error('books.settings', error),
            })
        },
    }
}

function summaryFor(
    id: SectionId,
    data: {
        settings: BooksSettings | undefined
        sequenceCount: number | undefined
        accounts1099: Parameters<typeof sectionSummary>[1]['accounts1099']
    }
): string {
    const { settings, sequenceCount, accounts1099 } = data
    if (id === 'numbering' && sequenceCount === undefined) return 'Document numbering'
    return sectionSummary(id, { settings, sequenceCount: sequenceCount ?? 0, accounts1099 })
}

function shellPart(state: { isReady: boolean; hasError: boolean; hasOpen: boolean }): ShellPart {
    if (state.hasError) return 'error'
    if (!state.isReady) return 'loading'
    return state.hasOpen ? 'detail' : 'list'
}
