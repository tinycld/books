import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
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

export type ShellPart = 'loading' | 'error' | 'list' | 'detail'

export function sectionFromParam(value: string | undefined): SectionId | undefined {
    return SETTINGS_SECTIONS.find(s => s.id === value)?.id
}

export function useSettingsShell(section: SectionId | undefined) {
    const access = useBooksAccess()
    const booksSettings = useBooksSettings()
    const docSequences = useDocSequences()
    const orgHref = useOrgHref()
    const isWide = useBreakpoint() !== 'mobile'
    const { isAdmin } = access

    const allowed = visibleSections(isAdmin)
    const requested = allowed.find(s => s.id === section)?.id
    const open = isWide ? (requested ?? 'company') : requested

    const sequences = docSequences.hasLoadError ? undefined : docSequences.sequences
    const sections = allowed.map(s => ({
        id: s.id,
        label: s.label,
        summary: summaryFor(s.id, booksSettings.settings, sequences?.length),
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
        retry: () => {
            booksSettings.retryLoad()
            docSequences.retryLoad()
        },
    }
}

function summaryFor(
    id: SectionId,
    settings: BooksSettings | undefined,
    sequenceCount: number | undefined
): string {
    if (id === 'numbering' && sequenceCount === undefined) return 'Document numbering'
    return sectionSummary(id, { settings, sequenceCount: sequenceCount ?? 0 })
}

function shellPart(state: { isReady: boolean; hasError: boolean; hasOpen: boolean }): ShellPart {
    if (state.hasError) return 'error'
    if (!state.isReady) return 'loading'
    return state.hasOpen ? 'detail' : 'list'
}
