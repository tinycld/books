import { create } from '@tinycld/core/lib/store'

// One popover or sheet is open at a time.
export type ReportSurface =
    | { kind: 'period' }
    | { kind: 'add-filter' }
    | { kind: 'filter-picker'; filterId: string }

// Folded sections last for one visit to a report, so this store is not persisted.
interface ReportUIState {
    folded: Record<string, string[]>
    surface: ReportSurface | null
    isCustomizeOpen: boolean
    toggleSection: (reportId: string, sectionId: string) => void
    setFolded: (reportId: string, sectionIds: string[]) => void
    openSurface: (surface: ReportSurface) => void
    closeSurface: () => void
    // Closes the surface only while it is still of this kind. A menu closes itself after an
    // item opened the next surface, and that close must not take the new surface with it.
    closeSurfaceOf: (kind: ReportSurface['kind']) => void
    openCustomize: () => void
    closeCustomize: () => void
    startVisit: (reportId: string) => void
}

function toggled(list: readonly string[], id: string): string[] {
    return list.includes(id) ? list.filter(item => item !== id) : [...list, id]
}

export const useReportUIStore = create<ReportUIState>()(set => ({
    folded: {},
    surface: null,
    isCustomizeOpen: false,
    toggleSection: (reportId, sectionId) =>
        set(state => ({
            folded: {
                ...state.folded,
                [reportId]: toggled(state.folded[reportId] ?? [], sectionId),
            },
        })),
    setFolded: (reportId, sectionIds) =>
        set(state => ({ folded: { ...state.folded, [reportId]: sectionIds } })),
    openSurface: surface => set({ surface }),
    closeSurface: () => set({ surface: null }),
    closeSurfaceOf: kind => set(state => (state.surface?.kind === kind ? { surface: null } : {})),
    openCustomize: () => set({ isCustomizeOpen: true }),
    closeCustomize: () => set({ isCustomizeOpen: false }),
    startVisit: reportId =>
        set(state => ({
            folded: { ...state.folded, [reportId]: [] },
            surface: null,
            isCustomizeOpen: false,
        })),
}))
